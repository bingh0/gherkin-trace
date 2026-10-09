'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { parseFeature } = require('gherkin-node-test');
const { resolveSources } = require('./sources');
const { readManifest } = require('./manifest');
const { openJournal, TREECONTEXT_MISSING } = require('./journal');
const { buildPicture } = require('./picture');
const { collectHistory, outlineBase } = require('./history');
const { resolveRefinements } = require('./refine');
const { acquireLock, releaseLock, writeRefreshOk, writeBroken } = require('./state');
const { healthyBlob, brokenBlob, writeBlob } = require('./blob');
const { queryAttention } = require('./attention');
const { reviewState, classifyChange, rulingCandidates, healingRuling } = require('./review');
const { computeHeat } = require('./heat');
const { parseFence, computeFenceSignals, mentionsTopic } = require('./fence');
const { collectSanctions, collectVerdicts, computeDilution, truncationBoundary } = require('./dilution');
const { GtRefusal, GtRefreshFailure } = require('./errors');
const { saturationCondition, quarantineCondition, tierAbsenceCondition } = require('./conditions');
const { sha256, formatTime, compareCodePoints, canonJson, jkey, excerpt } = require('./util');

/** @typedef {import('./sources').GtOptions} GtOptions */
/** @typedef {import('./picture').PNode} PNode */
/** @typedef {import('./picture').PEdge} PEdge */

// Signal families whose miners are not built yet. They are named dark on
// every refresh regardless of source presence — an unbuilt classifier must
// never read as "computed and quiet". Entries leave this list only when the
// layer that computes them lands.
/** @type {string[]} */
const UNBUILT_SIGNALS = [];

// One query's worth of ruling-shaped language — how "alongside" remarks
// (ruling-shaped, but naming no scenario) are found for the candidates list.
const RULING_POOL_QUERY =
  'ruled ruling passed approved ratified confirmed reaffirmed accepted rejected declined overturned';

// Enumeration through the recall surface: a query of only common words
// matches essentially every prose entry (documented FlatStore behavior),
// with topK set to the store's own node count. This is the pre-registered
// pressure point — density counting through a recall interface — and any
// shortfall is NAMED in notes, which is exactly the field evidence the
// treecontext stats-query graduation path asks for.
const ENUMERATION_QUERY =
  'the a an and or of to in on at is are was were be been it its this that these those '
  + 'for with from by as but not no so if then than still up down out over under about '
  + 'into onto we our you your they their he she i me my one all any some more most other '
  + 'keep keeps come comes coming go going do does did done have has had will would can could';

// How many journal hits are examined per identity when mining provenance.
// Bounded for scale; if a title genuinely has more discussing entries than
// this, the refresh says so in notes rather than silently dropping them.
const PROVENANCE_TOP_K = 500;

/**
 * Project the three read-only sources into one picture. The whole projection
 * is rebuilt from scratch every time — a picture is one refresh's truth.
 *
 * Refusals (no feature files, refresh already running) leave everything
 * untouched. A failure partway marks the picture broken so queries refuse
 * until a successful refresh restores answers.
 * @param {GtOptions} [opts]
 * @returns {Promise<Record<string, unknown>>} the refresh summary
 */
async function refresh(opts = {}) {
  const src = resolveSources(opts);
  // No features DIRECTORY is a project without feature files: refused. An
  // existing directory holding no scenarios yet is a different thing — a
  // true, stated empty corpus (gnt's dialect rejects zero-scenario FILES,
  // so file-level emptiness can only mean an empty directory).
  if (!src.featuresDirExists) {
    throw new GtRefusal(
      `no feature files found at ${src.featuresDir} — feature files are required; `
      + 'a picture cannot be built without them.');
  }

  const now = opts.now ?? new Date();
  const startedAt = now.toISOString();
  // Everything above this line is synchronous and side-effect free; the lock
  // is taken before the first await, so two refreshes can never interleave
  // their way past the guard.
  const lock = acquireLock(src.pictureDir, startedAt);
  if (!lock.acquired) {
    throw new GtRefusal(
      `a refresh is already running (started ${lock.holder.startedAt}, pid ${lock.holder.pid}) — `
      + 'a second refresh is refused while it runs.');
  }

  try {
    const { summary, blobData } = await runRefresh(src, formatTime(now));
    writeRefreshOk(src.pictureDir, summary);
    // The sidecar blob follows the refresh record (its half of the pane
    // seam) — same picture, same moment, written last so it never describes
    // a state that half-exists. Attention comes from the just-swapped
    // picture, the same query surface any consumer would ask.
    const attention = queryAttention(opts);
    writeBlob(src.pictureDir, healthyBlob({
      refreshedAt: /** @type {string} */ (summary.refreshedAt),
      dark: /** @type {string[]} */ (summary.dark),
      counts: /** @type {{features: number, scenarios: number}} */ (summary.counts),
      exceptions: /** @type {Array<{file: string}>} */ (summary.exceptions),
      heatWithheld: blobData.heatWithheld,
      reviewedCount: blobData.reviewedCount,
      attention: {
        total: attention.items.length,
        topTier: attention.items.length > 0 ? attention.items[0].tier : null,
      },
      breachCount: blobData.breachCount,
      possibleBreachCount: blobData.possibleBreachCount,
      hotRegions: blobData.hotRegions,
      hottestRegions: blobData.hottestRegions,
      refinementDark: blobData.refinementDark,
    }));
    releaseLock(src.pictureDir);
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    writeBroken(src.pictureDir, message, startedAt);
    // A file cannot refuse a read: the blob must confess the failure, with
    // the failed attempt's moment as its basis and no stale counts.
    writeBlob(src.pictureDir, brokenBlob(formatTime(now), `refresh failed partway: ${message}`));
    throw new GtRefreshFailure(`refresh failed partway: ${message}`, e);
  } finally {
    releaseLock(src.pictureDir);
  }
}

/**
 * @param {import('./sources').ResolvedSources} src @param {string} refreshedAt
 * @returns {Promise<{summary: Record<string, unknown>, blobData: {
 *   heatWithheld: boolean, reviewedCount: number, breachCount: number,
 *   possibleBreachCount: number, hotRegions: number, hottestRegions: number,
 *   refinementDark: boolean}}>}
 */
async function runRefresh(src, refreshedAt) {
  /** @type {string[]} */
  const notes = [];
  // Corpus-level conditions: a condition holding corpus-wide is one fact,
  // stated once with its members kept (campaign aggregation ruling).
  // Conditions are the single source — statements are never mirrored into
  // notes; the report and attention read the structured channel.
  /** @type {import('./conditions').Condition[]} */
  const conditions = [];

  // --- source one: feature files -----------------------------------------
  /** @type {Array<{file: string, error: string, line: number | null, statement: string}>} */
  const exceptions = [];
  /** @type {Array<{file: string, name: string, scenarios: import('gherkin-node-test').Scenario[], outlines: import('gherkin-node-test').ParsedFeature['outlines']}>} */
  const parsed = [];
  /** @type {Record<string, string>} */
  const featureHashes = {};
  for (const rel of src.featureFiles) {
    const abs = path.join(src.root, rel);
    const bytes = fs.readFileSync(abs);
    featureHashes[rel] = sha256(bytes);
    try {
      const p = parseFeature(bytes.toString('utf8'), rel);
      const dup = firstDuplicateTitle(p.scenarios);
      if (dup !== null) {
        exceptions.push({
          file: rel,
          error: `duplicate scenario title "${dup}" — path + title is scenario identity and must be unique`,
          line: null,
          statement: `${rel} holds a duplicate scenario title — its scenarios are absent from the picture until titles are unique.`,
        });
        continue;
      }
      parsed.push({ file: rel, name: p.feature, scenarios: p.scenarios, outlines: p.outlines });
    } catch (e) {
      const err = /** @type {{ message?: string, line?: number }} */ (e);
      exceptions.push({
        file: rel,
        error: err.message ?? String(e),
        line: typeof err.line === 'number' ? err.line : null,
        statement: `${rel} failed to parse — its scenarios are absent from the picture until the file parses.`,
      });
    }
  }
  // Mass quarantine rolls up by cause — additive: every exception above
  // stays individually named; the corpus-wide shape is stated once.
  const quarantineCond = quarantineCondition(exceptions, src.featureFiles.length);
  if (quarantineCond !== null) conditions.push(quarantineCond);

  // --- source two: binding status (the run manifest) ----------------------
  /** @type {Map<string, string> | null} */
  let binding = null;
  /** @type {string | null} */
  let manifestHash = null;
  if (src.manifest !== null) {
    const bytes = fs.readFileSync(src.manifest);
    manifestHash = sha256(bytes);
    binding = new Map();
    for (const row of readManifest(src.manifest, src.root)) {
      binding.set(jkey(row.file, row.title), row.status);
    }
  }

  // --- the fence: transcribed negative intent ------------------------------
  /** @type {string | null} */
  let fenceHash = null;
  /** @type {import('./fence').FenceEntry[]} */
  let fences = [];
  /** @type {string | null} */
  let fenceText = null;
  if (src.fence !== null) {
    const bytes = fs.readFileSync(src.fence);
    fenceHash = sha256(bytes);
    fenceText = bytes.toString('utf8');
    fences = parseFence(fenceText);
  }
  if (src.shadowedFence !== null && src.fence !== null) {
    notes.push(
      `the fence at ${relToRoot(src.root, src.fence)} shadows `
      + `${relToRoot(src.root, src.shadowedFence)} — one fence authority per `
      + 'picture; the shadowed file was not read');
  }

  // --- assemble the corpus -------------------------------------------------
  /** @type {PNode[]} */
  const nodes = [];
  /** @type {PEdge[]} */
  const edges = [];
  /**
   * @type {Array<{key: string, file: string, title: string, line: number,
   *   tags: string[], steps: string[], bodyHash: string, tier: string}>}
   */
  const corpus = [];
  for (const f of parsed) {
    const featureKey = `feature:${f.file}`;
    nodes.push({ kind: 'feature', key: featureKey, data: { file: f.file, name: f.name } });
    for (const s of f.scenarios) {
      const steps = s.steps.map((st) => `${st.keyword} ${st.text}`);
      corpus.push({
        key: `scenario:${jkey(f.file, s.name)}`,
        file: f.file,
        title: s.name,
        line: s.line,
        tags: s.tags,
        steps,
        bodyHash: sha256(steps.join('\n')),
        tier: f.file.split('/').includes('design') ? 'design' : 'uat',
      });
    }
  }
  // A source tree with no design tier at all is one corpus-level fact
  // (ruled) — attention reads this condition to suppress the per-scenario
  // unrefined flood and name the absence instead; the blob darkens its
  // attention row so the pane is never silently green.
  const tierCond = tierAbsenceCondition(corpus, src.featureFiles);
  if (tierCond !== null) conditions.push(tierCond);

  // --- identity: scenario timelines from git ------------------------------
  /** @type {Map<string, import('./history').SnapEntry>} */
  const currentSnap = new Map(corpus.map((c) => [
    jkey(c.file, c.title),
    { file: c.file, title: c.title, bodyHash: c.bodyHash, steps: c.steps },
  ]));
  // Outlines: rows are assertion mass (dilution R14) — the working-tree
  // row counts join the historical series.
  /** @type {Map<string, number>} */
  const currentOutlines = new Map();
  /** @type {Array<{file: string, name: string}>} */
  const outlineList = [];
  for (const f of parsed) {
    for (const o of f.outlines ?? []) {
      currentOutlines.set(jkey(f.file, outlineBase(o.name)), o.rows);
      outlineList.push({ file: f.file, name: outlineBase(o.name) });
    }
  }
  const featuresRel = relToRoot(src.root, src.featuresDir) || '.';
  let history = collectHistory(src.root, featuresRel, currentSnap, [], currentOutlines);

  // --- source three: the journal — provenance, rulings, healings ----------
  const refreshedAtIso = `${refreshedAt.replace(' ', 'T')}:00Z`;
  /** @type {string | null} */
  let journalHash = null;
  let journalEmpty = false;
  /** @type {Map<string, import('./review').MinedEntry[]>} mention entries per scenario key */
  let mentionsByKey = new Map();
  /** @type {import('./review').MinedEntry[]} ruling-shaped entries naming no scenario */
  let rulingPool = [];
  /** @type {import('./review').MinedEntry[]} every enumerable journal entry, for density */
  let allEntries = [];
  /** @type {Map<string, {file: string, title: string, ruling: string}>} healed closed-thread keys */
  const healedThreads = new Map();

  // Saturation is collected across every mining pass and disclosed after
  // the journal closes: itemized per title, or — corpus-wide — collapsed
  // into one condition (campaign F3 ruling).
  /** @type {Set<string>} */
  const minedTitles = new Set();
  /** @type {Set<string>} */
  const saturatedTitles = new Set();
  // A store named but unreadable because the peer that reads it is not
  // installed is an absent source, not a broken picture (ruled 2026-10-08):
  // the picture builds from the rest, the journal is named absent with the
  // install teaching, and its signal families go dark.
  const journal = src.journal === null ? null
    : await openJournal(src.journal, src.journalNamespace).catch((e) => {
      if (/** @type {{code?: string}} */ (e).code !== TREECONTEXT_MISSING) throw e;
      notes.push(`journal ${relToRoot(src.root, /** @type {string} */ (src.journal))} named but not read: `
        + (e instanceof Error ? e.message : String(e)));
      return null;
    });
  if (journal !== null) {
    try {
      journalHash = journal.hash;
      if (journal.totalNodes === 0) {
        journalEmpty = true;
        notes.push(
          `the journal store holds no entries in namespace "${src.journalNamespace}" — `
          + 'a namespace mismatch would look exactly like this; heat, provenance, and review status stay dark.');
      }

      /**
       * Mention-mine one set of identities: entries containing any full
       * title. v1 provenance floor — high precision; recall grows later.
       * @param {string[]} titles
       * @returns {Promise<import('./review').MinedEntry[]>}
       */
      const mineMentions = async (titles) => {
        /** @type {Map<string, import('./review').MinedEntry>} */
        const found = new Map();
        for (const title of titles) {
          minedTitles.add(title);
          const hits = await journal.query(title, { topK: PROVENANCE_TOP_K });
          if (hits.length === PROVENANCE_TOP_K) saturatedTitles.add(title);
          const needle = title.toLowerCase();
          for (const h of hits) {
            if (!h.content.toLowerCase().includes(needle)) continue;
            if (found.has(h.nodeId)) continue;
            const meta = h.metadata ?? {};
            found.set(h.nodeId, {
              tcNodeId: h.nodeId,
              createdAt: h.createdAt,
              role: typeof meta.role === 'string' ? meta.role : null,
              sessionId: typeof meta.session_id === 'string' ? meta.session_id : null,
              content: h.content,
              excerpt: excerpt(h.content, 240),
            });
          }
        }
        return [...found.values()];
      };

      /** @param {import('./history').History} h @returns {string[]} identities of a live thread */
      const identitiesOf = (/** @type {{file: string, title: string}} */ c, h) => {
        const tl = h.timelines.get(jkey(c.file, c.title));
        const titles = [c.title];
        if (tl !== undefined) {
          for (const ft of tl.formerTitles) {
            if (!titles.includes(ft.title)) titles.push(ft.title);
          }
        }
        return titles;
      };

      // Pass one: mentions per live scenario, and healing rulings for the
      // closed threads history could not confirm by bytes.
      /** @type {Array<{from: {file: string, title: string}, to: {file: string, title: string}, ruling: string}>} */
      const healings = [];
      for (const ct of history.closed) {
        if (ct.candidates.length === 0) continue;
        const entries = await mineMentions([ct.title]);
        const healed = healingRuling(entries, { file: ct.file, title: ct.title }, ct.candidates);
        if (healed !== null) {
          healings.push({ from: { file: ct.file, title: ct.title }, to: { file: healed.to.file, title: healed.to.title }, ruling: healed.ruling });
        }
      }
      if (healings.length > 0) {
        // A ruling confirmed what the bytes could not: rebuild the timelines
        // with the healings applied, then mine again over the richer
        // identity threads.
        history = collectHistory(src.root, featuresRel, currentSnap, healings, currentOutlines);
        for (const h of healings) {
          healedThreads.set(jkey(h.to.file, h.to.title), { file: h.from.file, title: h.from.title, ruling: h.ruling });
        }
      }
      for (const c of corpus) {
        mentionsByKey.set(c.key, await mineMentions(identitiesOf(c, history)));
      }
      // Closed threads get mined too: whether the removed scenario was
      // reviewed decides how loudly its closure reports.
      for (const ct of history.closed) {
        mentionsByKey.set(`closed:${jkey(ct.file, ct.title)}`, await mineMentions([ct.title]));
      }

      // The ruling pool: ruling-shaped language anywhere in the journal —
      // how an "alongside" remark that names no scenario is found.
      const poolHits = await journal.query(RULING_POOL_QUERY, { topK: PROVENANCE_TOP_K });
      if (poolHits.length === PROVENANCE_TOP_K) {
        notes.push(
          `the ruling-shaped entry pool hit its ${PROVENANCE_TOP_K}-result bound — `
          + 'some ruling candidates may be unlisted.');
      }
      rulingPool = poolHits.map((h) => {
        const meta = h.metadata ?? {};
        return {
          tcNodeId: h.nodeId,
          createdAt: h.createdAt,
          role: typeof meta.role === 'string' ? meta.role : null,
          sessionId: typeof meta.session_id === 'string' ? meta.session_id : null,
          content: h.content,
          excerpt: excerpt(h.content, 240),
        };
      });

      // Enumerate for heat density counting (see ENUMERATION_QUERY note).
      if (journal.totalNodes > 0) {
        const enumHits = await journal.query(ENUMERATION_QUERY, { topK: journal.totalNodes });
        allEntries = enumHits.map((h) => {
          const meta = h.metadata ?? {};
          return {
            tcNodeId: h.nodeId,
            createdAt: h.createdAt,
            role: typeof meta.role === 'string' ? meta.role : null,
            sessionId: typeof meta.session_id === 'string' ? meta.session_id : null,
            content: h.content,
            excerpt: excerpt(h.content, 240),
          };
        });
        if (allEntries.length < journal.totalNodes) {
          notes.push(
            `heat enumeration through the recall surface saw ${allEntries.length} of `
            + `${journal.totalNodes} journal entries — entries outside common vocabulary are `
            + 'invisible to density counting (the pre-registered treecontext stats-query pressure point).');
        }
        // Union in the mention-mined entries: an entry short on function
        // words but naming a scenario title must still count toward its
        // session's density.
        const known = new Set(allEntries.map((e) => e.tcNodeId));
        for (const mentions of mentionsByKey.values()) {
          for (const m of mentions) {
            if (!known.has(m.tcNodeId)) {
              known.add(m.tcNodeId);
              allEntries.push(m);
            }
          }
        }
        const sessionless = allEntries.filter((e) => e.sessionId === null).length;
        if (sessionless > 0) {
          notes.push(
            `${sessionless} journal entr(y/ies) carry no session id — invisible to density counting.`);
        }
        if (allEntries.length > 0 && !allEntries.some((e) => e.role === 'user')) {
          notes.push(
            'no journal entries carry a user role — rulings and fence pressure cannot fire; '
            + 'review status is effectively dark.');
        }
      }
    } finally {
      journal.close();
    }
  }
  {
    const satCond = saturationCondition([...saturatedTitles], minedTitles.size, PROVENANCE_TOP_K);
    if (satCond !== null) {
      conditions.push(satCond);
    } else {
      for (const title of [...saturatedTitles].sort(compareCodePoints)) {
        notes.push(
          `provenance mining for "${title}" hit its ${PROVENANCE_TOP_K}-result bound — `
          + 'some discussing entries may be unlinked.');
      }
    }
  }

  // --- review states, per scenario ----------------------------------------
  /** @type {Map<string, import('./review').ReviewState>} */
  const reviewByKey = new Map();
  /** @type {Map<string, Array<{tcNodeId: string, date: string, excerpt: string}>>} */
  const candidatesByKey = new Map();
  if (journal !== null && !journalEmpty) {
    for (const c of corpus) {
      const mentions = mentionsByKey.get(c.key) ?? [];
      const tl = history.timelines.get(jkey(c.file, c.title));
      const identityTitles = [c.title, ...(tl?.formerTitles.map((f) => f.title) ?? [])];
      let state = reviewState(mentions, tl, refreshedAtIso, identityTitles);
      state = classifyChange(state, mentions);
      reviewByKey.set(c.key, state);
      if (state.status === 'reviewed-then-changed' && state.change !== null) {
        if (!state.change.orderEstablished) {
          notes.push(
            `"${c.title}" (${c.file}): the order of ruling and change could not be established — `
            + 'conservatively expired to reviewed-then-changed.');
        } else if (!state.change.declared) {
          notes.push(
            `"${c.title}" (${c.file}): a ruled-on scenario changed without traced discussion `
            + 'in the change interval — a quiet change.');
        }
      }
      if (state.status !== 'reviewed') {
        const titles = [c.title, ...(tl?.formerTitles.map((f) => f.title) ?? [])];
        const cands = rulingCandidates(mentions, rulingPool, titles);
        if (cands.length > 0) candidatesByKey.set(c.key, cands);
      }
    }
  }

  // --- spec dilution: the watched set, sanctions, and sightings ------------
  const sanctions = src.fence === null || fenceText === null ? []
    : collectSanctions(src.root, relToRoot(src.root, src.fence) || 'OUT-OF-SCOPE.md', fenceText);
  const verdicts = collectVerdicts(src.root,
    src.manifest === null ? null : relToRoot(src.root, src.manifest));
  /** @type {Set<string>} */
  const reviewedKeys = new Set();
  for (const c of corpus) {
    const st = reviewByKey.get(c.key);
    if (st !== undefined && st.status !== null) reviewedKeys.add(jkey(c.file, c.title));
  }
  const dilutionCorpus = corpus.map((c) => ({ key: jkey(c.file, c.title), file: c.file, title: c.title }));
  for (const o of outlineList) {
    const ok = jkey(o.file, o.name);
    dilutionCorpus.push({ key: ok, file: o.file, title: o.name });
    // An outline is watched through its rows: a review ruling that anchors
    // any expanded row anchors the outline's mass series.
    const anyRowReviewed = corpus.some((c) => c.file === o.file
      && c.title.startsWith(`${o.name} [`) && reviewedKeys.has(jkey(c.file, c.title)));
    if (anyRowReviewed) reviewedKeys.add(ok);
  }
  /** @type {Map<string, Array<{commit: string, date: string, thens: number, rows: number | null}>>} */
  const massSeries = new Map();
  for (const [k, tl] of history.timelines) {
    massSeries.set(k, tl.mass.map((m) => ({ commit: m.commit, date: m.date, thens: m.thens, rows: null })));
  }
  for (const [k, pts] of history.outlineSeries) {
    massSeries.set(k, pts.map((pt) => ({ commit: pt.commit, date: pt.date, thens: 0, rows: pt.rows })));
  }
  // Outline verdicts: rows aggregate to their base — green only when
  // every recorded row passed (R14). Scoped to KNOWN outlines; historical
  // rows (deleted ones included) come from the series keys themselves.
  for (const o of outlineList) {
    const ok = jkey(o.file, o.name);
    if (verdicts.series.has(ok)) continue;
    /** @type {Map<string, boolean>} date → all-passed so far */
    const byDate = new Map();
    for (const [sk, sv] of verdicts.series) {
      /** @type {[string, string]} */
      let parsed;
      try {
        parsed = JSON.parse(sk);
      } catch {
        continue;
      }
      const [sf, st] = parsed;
      if (sf !== o.file || !st.startsWith(`${o.name} [`)) continue;
      for (const v of sv) {
        byDate.set(v.date, (byDate.get(v.date) ?? true) && v.status === 'passed');
      }
    }
    if (byDate.size > 0) {
      verdicts.series.set(ok, [...byDate.entries()]
        .sort((a, b) => compareCodePoints(a[0], b[0]))
        .map(([date, ok2]) => ({ date, status: ok2 ? 'passed' : 'failed' })));
    }
  }
  const dilution = computeDilution({
    corpus: dilutionCorpus,
    timelines: history.timelines,
    massSeries,
    closed: history.closed,
    verdicts,
    sanctions,
    reviewedKeys,
    truncatedBefore: truncationBoundary(src.root),
  });
  notes.push(...dilution.notes);
  // A covered edit's reviewed-then-changed flag stands down — the
  // confirmation is its voice (R3); an uncovered edit keeps the flag.
  for (const c of corpus) {
    const st = reviewByKey.get(c.key);
    const cov = dilution.covered.get(jkey(c.file, c.title));
    if (st?.change != null && st.change.date !== null && cov !== undefined
      && cov.includes(st.change.date)) {
      st.change.sanctioned = true;
    }
  }
  // R20/R24: a sanction entry is itself review provenance — the reviewed
  // mark carries a pointer to the sanctioning entry.
  for (const c of corpus) {
    const jk = jkey(c.file, c.title);
    const prov = dilution.provenance.get(jk);
    if (prov !== undefined && reviewByKey.get(c.key)?.status == null) {
      // An uncovered edit after the sanctioning entry expires the mark to
      // reviewed-then-changed exactly as a journal ruling would — the
      // fence entry has no discussion channel, so the change is quiet.
      const cov = dilution.covered.get(jk) ?? [];
      const uncovered = (history.timelines.get(jk)?.events ?? [])
        .filter((e) => e.event === 'changed' && e.date !== ''
          && prov.entryDate !== null && e.date > `${prov.entryDate}T00:00:00Z`
          && !cov.includes(e.date));
      const last = uncovered.length > 0 ? uncovered[uncovered.length - 1] : undefined;
      reviewByKey.set(c.key, {
        status: last === undefined ? 'reviewed' : 'reviewed-then-changed',
        ruling: {
          tcNodeId: `sanction:${prov.line}`,
          date: prov.entryDate ?? '',
          polarity: 'positive',
          excerpt: `Sanctioned-changes entry (fence line ${prov.line}) — a dated ruling naming this scenario`,
        },
        rulings: [],
        change: last === undefined ? null : {
          kind: 'committed',
          date: last.date,
          interval: { from: prov.entryDate, to: last.date },
          orderEstablished: true,
          declared: false,
          discussion: [],
        },
      });
    }
  }

  // --- binding join, scenario nodes, identity + review woven in ------------
  let matchedManifestRows = 0;
  for (const c of corpus) {
    const tl = history.timelines.get(jkey(c.file, c.title));
    /** @type {string | null} */
    let status = null;
    if (binding !== null) {
      // The join tries every identity the scenario has carried: a run
      // recorded under a former title is still a run of THIS scenario —
      // a confirmed rename must not flip it to never-run.
      let hit = binding.get(jkey(c.file, c.title));
      if (hit === undefined && tl !== undefined) {
        for (const former of tl.formerTitles) {
          hit = binding.get(jkey(former.file, former.title));
          if (hit !== undefined) break;
        }
      }
      if (hit !== undefined) {
        status = hit;
        matchedManifestRows++;
      } else {
        status = 'never-run';
      }
    }
    /** @type {Record<string, unknown>} */
    const data = {
      file: c.file,
      title: c.title,
      line: c.line,
      tier: c.tier,
      tags: c.tags,
      bodyHash: c.bodyHash,
      bindingStatus: status,
    };
    if (tl !== undefined) {
      data.formerTitles = tl.formerTitles;
      data.lastCommittedChange = tl.lastCommittedChange;
      data.uncommittedChange = tl.uncommittedChange;
    }
    const healed = healedThreads.get(jkey(c.file, c.title));
    if (healed !== undefined) data.healedBy = healed.ruling;
    const review = reviewByKey.get(c.key);
    if (review !== undefined) data.review = review;
    const cands = candidatesByKey.get(c.key);
    if (cands !== undefined) data.rulingCandidates = cands;
    const jk = jkey(c.file, c.title);
    const dsig = dilution.signals.get(jk);
    if (dsig !== undefined) data.dilution = { signals: dsig };
    const dtl = dilution.timelinesOut.get(jk);
    if (dtl !== undefined && dtl.length > 0) data.dilutionTimeline = dtl;
    nodes.push({ kind: 'scenario', key: c.key, data });
    edges.push({ src: `feature:${c.file}`, dst: c.key, cls: 'structural' });
    if (review?.rulings) {
      for (const r of review.rulings) {
        edges.push({ src: c.key, dst: `ruling:${r.tcNodeId}`, cls: 'ruling' });
      }
    }
  }
  const scenarioCount = corpus.length;
  const unmatchedManifestRows = binding === null ? null : binding.size - matchedManifestRows;
  if (unmatchedManifestRows !== null && unmatchedManifestRows > 0) {
    notes.push(
      `${unmatchedManifestRows} run-manifest row(s) name scenarios absent from the corpus — `
      + 'evidence of deletions or renames since the recorded run.');
  }

  // Closed threads are picture content: a severed history is reported, never
  // silently dropped, and rename candidates ride with their evidence. A
  // reviewed thread's closure is the loudest kind: declared intent removed.
  for (const ct of history.closed) {
    /** @type {Record<string, unknown>} */
    const data = {
      file: ct.file,
      title: ct.title,
      closedAt: ct.closedAt,
      reason: ct.reason,
      candidates: ct.candidates,
    };
    const sd = dilution.sanctionedDeletions.get(jkey(ct.file, ct.title));
    if (sd !== undefined) {
      // R18: the thread end spent the deletes-scenario sanction — a
      // confirmation, never a quiet removal.
      data.sanctionedDeletion = sd;
      notes.push(
        `"${ct.title}" (${ct.file}): a sanctioned deletion landed as ruled — the entry `
        + 'was spent at the thread end.');
    }
    const mentions = mentionsByKey.get(`closed:${jkey(ct.file, ct.title)}`);
    if (mentions !== undefined) {
      // Only rulings that PRECEDE the closure can make the closed thread
      // "reviewed at closure" — a post-deletion remark ("confirmed: X was
      // deleted") must not retroactively bless the removal (adversarial
      // catch).
      const upper = ct.closedAt.date !== '' ? ct.closedAt.date : refreshedAtIso;
      const beforeClosure = mentions.filter((m) =>
        new Date(m.createdAt * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') <= upper);
      const state = reviewState(beforeClosure, undefined, refreshedAtIso, [ct.title]);
      data.reviewedAtClosure = state.status === 'reviewed';
      if (state.ruling !== null) data.ruling = state.ruling;
      if (data.reviewedAtClosure === true && state.ruling !== null) {
        // Was the removal discussed? Same window logic as a quiet change:
        // discussion after the ruling, up to the closing commit (or the
        // refresh, for a working-tree removal).
        const ruled = state.ruling.date;
        data.removalDeclared = beforeClosure.some((m) => {
          const d = new Date(m.createdAt * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
          return d > ruled && d <= upper;
        });
      }
      if (data.reviewedAtClosure === true && ct.reason === 'deleted') {
        notes.push(
          `"${ct.title}" (${ct.file}): reviewed intent removed — a ruled-on scenario was deleted `
          + 'with no similar scenario appearing.');
      }
    }
    if (ct.reason === 'unconfirmed-rename') {
      notes.push(
        `"${ct.title}" (${ct.file}): identity thread broken — closed as an unconfirmed rename `
        + `with ${ct.candidates.length} candidate(s) offered.`);
    }
    nodes.push({
      kind: 'closed_scenario',
      key: `closed:${jkey(ct.file, ct.title)}@${ct.closedAt.commit}`,
      data,
    });
  }

  // Outline nodes carry the mass-series face of dilution (rows, R14).
  for (const o of outlineList) {
    const ok = jkey(o.file, o.name);
    const dsig = dilution.signals.get(ok);
    const dtl = dilution.timelinesOut.get(ok);
    if (dsig === undefined && (dtl === undefined || dtl.length === 0)) continue;
    /** @type {Record<string, unknown>} */
    const odata = { file: o.file, title: o.name, watched: reviewedKeys.has(ok) };
    if (dsig !== undefined) odata.dilution = { signals: dsig };
    if (dtl !== undefined && dtl.length > 0) odata.dilutionTimeline = dtl;
    nodes.push({ kind: 'outline', key: `outline:${ok}`, data: odata });
  }

  // --- refinement: design scenarios traced to declared intent -------------
  for (const r of resolveRefinements(corpus, history)) {
    edges.push({ src: r.designKey, dst: r.uatKey, cls: 'refinement', data: { basis: r.basis } });
  }

  // --- conversation heat ----------------------------------------------------
  let heatWithheld = false;
  /** @type {import('./heat').Region[]} */
  let regions = [];
  if (journal !== null && !journalEmpty) {
    const heat = computeHeat({
      allEntries,
      corpus,
      mentionsByKey,
      reviewByKey,
      timelines: history.timelines,
    });
    heatWithheld = heat.withheld;
    regions = heat.regions;
    if (heat.withheld && heat.regions.length > 0) {
      notes.push(
        'no natural break exists in discussion density — heat classification is withheld this refresh.');
    }
    const openContested = regions.filter((r) => r.state === 'contested' && r.boundaryOpen);
    for (const r of openContested) {
      notes.push(
        `region ${r.sessionId}: an uncommitted spec change leaves the discussion-vs-spec order `
        + 'unestablished — contested is the conservative reading.');
    }
  }
  if (history.available && (history.skipped.commits > 0 || history.skipped.blobs > 0)) {
    notes.push(
      `identity mining skipped ${history.skipped.commits} unreadable commit(s) and carried `
      + `${history.skipped.blobs} unparseable historical file version(s) forward as unknown.`);
  }

  // --- fence signals --------------------------------------------------------
  let breachCount = 0;
  let possibleBreachCount = 0;
  if (src.fence !== null) {
    const { pressures, breaches, guardianships, dateless } = computeFenceSignals({
      fences,
      corpus,
      allEntries,
      timelines: history.timelines,
    });
    for (const topic of dateless) {
      notes.push(
        `the fence entry "${topic}" carries no ruling date in its trailing parenthetical — `
        + 'pressure detection cannot run for it.');
    }
    // Fenced silence: an uncaptured region whose discussion clearly names a
    // fenced topic is not under-covered — it is fenced, and the suppression
    // cites the ruling. Only a CLEAR topic match may silence a flag.
    const contentById = new Map(allEntries.map((e) => [e.tcNodeId, e.content]));
    for (const r of regions) {
      if (r.state !== 'uncaptured') continue;
      for (const fence of fences) {
        const matched = r.entryIds.some((id) => {
          const content = contentById.get(id);
          return content !== undefined && mentionsTopic(fence, content);
        });
        if (matched) {
          r.state = 'fenced';
          r.flag = null;
          r.suppressedBy = { topic: fence.topic, line: fence.line, effectiveDate: fence.effectiveDate };
          break;
        }
      }
    }
    for (const fence of fences) {
      nodes.push({
        kind: 'fence_ruling',
        key: `fence:${fence.topic}`,
        data: {
          topic: fence.topic,
          text: fence.text,
          dates: fence.dates,
          firstDate: fence.firstDate,
          effectiveDate: fence.effectiveDate,
          line: fence.line,
          pressure: pressures.get(fence.topic) ?? null,
        },
      });
    }
    for (const b of breaches) {
      if (b.kind === 'breach') breachCount++;
      else possibleBreachCount++;
      edges.push({
        src: b.scenarioKey,
        dst: `fence:${b.fenceTopic}`,
        cls: 'fence',
        data: { kind: b.kind, predates: b.predates, score: b.score },
      });
      if (b.predates) {
        notes.push(
          `a ${b.kind === 'breach' ? 'fence breach' : 'possible fence breach'} predates its ruling — `
          + `the scenario existed before "${b.fenceTopic}" was fenced.`);
      }
    }
    for (const g of guardianships) {
      // The guardian edge is the citation: the lexical match is suppressed
      // by the guarded-by transcription, never silently.
      edges.push({
        src: g.scenarioKey,
        dst: `fence:${g.fenceTopic}`,
        cls: 'fence',
        data: { kind: 'guardian', predates: false, score: 0 },
      });
      notes.push(
        `a scenario guards the fence entry "${g.fenceTopic}" — its lexical match is `
        + `suppressed by the guarded-by transcription (fence line ${g.fenceLine}).`);
    }
  }
  for (const r of regions) {
    nodes.push({ kind: 'region', key: `region:${r.sessionId}`, data: { ...r } });
  }

  // --- journal-derived nodes ----------------------------------------------
  {
    /** @type {Map<string, import('./review').MinedEntry>} */
    const referenced = new Map();
    /** @type {Set<string>} */
    const sessions = new Set();
    for (const c of corpus) {
      for (const m of mentionsByKey.get(c.key) ?? []) {
        referenced.set(m.tcNodeId, m);
        if (m.sessionId !== null) sessions.add(m.sessionId);
        edges.push({ src: c.key, dst: `journal:${m.tcNodeId}`, cls: 'provenance', data: { basis: 'title-mention' } });
      }
      for (const cand of candidatesByKey.get(c.key) ?? []) {
        const entry = rulingPool.find((p) => p.tcNodeId === cand.tcNodeId);
        if (entry !== undefined) {
          referenced.set(entry.tcNodeId, entry);
          if (entry.sessionId !== null) sessions.add(entry.sessionId);
        }
      }
    }
    for (const e of referenced.values()) {
      nodes.push({
        kind: 'journal_entry',
        key: `journal:${e.tcNodeId}`,
        data: {
          tcNodeId: e.tcNodeId,
          createdAt: e.createdAt,
          role: e.role,
          sessionId: e.sessionId,
          excerpt: e.excerpt,
        },
      });
      if (e.sessionId !== null) {
        edges.push({ src: `journal:${e.tcNodeId}`, dst: `session:${e.sessionId}`, cls: 'structural' });
      }
    }
    // Human rulings are first-class nodes — the evidence the reviewed set
    // stands on.
    /** @type {Map<string, {tcNodeId: string, date: string, polarity: string, excerpt: string}>} */
    const rulingNodes = new Map();
    for (const state of reviewByKey.values()) {
      for (const r of state.rulings) rulingNodes.set(r.tcNodeId, r);
    }
    for (const r of rulingNodes.values()) {
      nodes.push({ kind: 'human_ruling', key: `ruling:${r.tcNodeId}`, data: { ...r } });
    }
    for (const id of [...sessions].sort(compareCodePoints)) {
      nodes.push({ kind: 'session', key: `session:${id}`, data: { sessionId: id } });
    }
  }

  // --- absences and dark signals, named -----------------------------------
  /** @type {string[]} */
  const absent = [];
  const darkSet = new Set(UNBUILT_SIGNALS);
  if (src.manifest === null) {
    absent.push('binding status');
    darkSet.add('binding signals');
  }
  if (journal === null) {
    absent.push('journal');
  }
  if (journal === null || journalEmpty) {
    darkSet.add('heat');
    darkSet.add('provenance');
    darkSet.add('review status');
  }
  if (src.fence === null) {
    absent.push('out-of-scope list');
    darkSet.add('fence signals');
  }
  if (!history.available) {
    absent.push('change history');
    darkSet.add('rename tracking');
    darkSet.add('dilution signals');
  }
  const dark = [...darkSet].sort(compareCodePoints);

  const sources = {
    featureFiles: src.featureFiles,
    manifest: src.manifest === null ? null : relToRoot(src.root, src.manifest),
    journal: journal === null ? null : relToRoot(src.root, /** @type {string} */ (src.journal)),
    fence: src.fence === null ? null : relToRoot(src.root, src.fence),
  };
  const counts = { features: parsed.length, scenarios: scenarioCount };
  const sourceHashes = {
    features: featureHashes,
    manifest: manifestHash,
    journal: journalHash,
    fence: fenceHash,
  };
  // The generation ties picture bytes to their provenance record: both carry
  // it, and openForQuery refuses to stitch one generation's bytes to
  // another's summary. Derived from sources only, so determinism holds.
  const generation = sha256(canonJson(sourceHashes));

  // Broken identity threads surface in the summary too: a severed history is
  // report content, not just picture content.
  const closedThreads = history.closed.map((ct) => {
    const mentions = mentionsByKey.get(`closed:${jkey(ct.file, ct.title)}`);
    return {
      file: ct.file,
      title: ct.title,
      reason: ct.reason,
      closedAt: ct.closedAt.date,
      candidates: ct.candidates,
      reviewedAtClosure: mentions === undefined
        ? null
        : reviewState(
          mentions.filter((m) =>
            new Date(m.createdAt * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
              <= (ct.closedAt.date !== '' ? ct.closedAt.date : refreshedAtIso)),
          undefined, refreshedAtIso, [ct.title],
        ).status === 'reviewed',
    };
  });

  buildPicture(src.pictureDir, {
    nodes,
    edges,
    meta: {
      generation, sources, absent, dark, counts, exceptions, notes, conditions,
      sourceHashes, unmatchedManifestRows, closedThreads, heatWithheld,
    },
  });

  let reviewedCount = 0;
  for (const state of reviewByKey.values()) {
    if (state.status === 'reviewed') reviewedCount++;
  }
  return {
    summary: {
      refreshedAt,
      generation,
      sources,
      absent,
      dark,
      counts,
      exceptions,
      notes,
      conditions,
      unmatchedManifestRows,
      closedThreads,
    },
    blobData: {
      heatWithheld,
      reviewedCount,
      breachCount,
      possibleBreachCount,
      hotRegions: regions.filter((r) => r.flag === 'hot').length,
      hottestRegions: regions.filter((r) => r.flag === 'hottest').length,
      refinementDark: tierCond !== null,
    },
  };
}

/** @param {import('gherkin-node-test').Scenario[]} scenarios @returns {string | null} */
function firstDuplicateTitle(scenarios) {
  const seen = new Set();
  for (const s of scenarios) {
    if (seen.has(s.name)) return s.name;
    seen.add(s.name);
  }
  return null;
}

/** @param {string} root @param {string} abs @returns {string} */
function relToRoot(root, abs) {
  const rel = path.relative(root, abs);
  return rel.startsWith('..') ? abs.split(path.sep).join('/') : rel.split(path.sep).join('/');
}

module.exports = { refresh };
