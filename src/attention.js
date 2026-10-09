'use strict';
const { load } = require('./trace');
const { compareCodePoints } = require('./util');

// Attention routing — one ranked list of what deserves the human's eyes.
// Tier order encodes the ratified rulings — the dilution interview's R9
// "defiance at the top" ladder: a sanction violation defied a written
// ruling and ranks breach-class; a quiet removal outranks a verdict-coupled
// edit outranks an assertion decline outranks a quiet edit outranks a
// declared edit (the absorbed reviewed-then-changed orderings carry over);
// never-run outranks orphan; confirmations rank last — resolved business.
// An item sits at its TOP signal's tier; co-occurring signals are displayed
// evidence beneath it, never ranking arithmetic (rank boosting is fenced).
// Empty means empty — and the answer names what it could not see.

const TIERS = /** @type {const} */ ([
  'breach',
  'sanction-violation',
  'possible-breach',
  'quiet-removal',
  'verdict-coupled',
  'assertion-decline',
  'quiet-edit',
  'declared-edit',
  'never-run',
  'orphan',
  'unrefined',
  'pressure',
  'uncaptured',
  'contested',
  'confirmation',
]);

/** @typedef {typeof TIERS[number]} Tier */
/**
 * @typedef {{
 *   tier: Tier,
 *   rank: number,
 *   kind: 'scenario' | 'closed' | 'fence' | 'region',
 *   file?: string, title?: string, topic?: string, sessionId?: string,
 *   evidence: Record<string, unknown>,
 *   absorbed: Array<{signal: string, evidence: Record<string, unknown>}>,
 * }} AttentionItem
 */

/**
 * @param {import('./sources').GtOptions} [opts]
 * @returns {{
 *   refreshedAt: string,
 *   sourcesChanged: boolean,
 *   items: AttentionItem[],
 *   tiers: Array<{tier: Tier, count: number, absorbed: number,
 *     groups: Array<{file: string, count: number}>,
 *     largestCluster: {file: string, count: number} | null}>,
 *   limitations: string[],
 * }}
 */
function queryAttention(opts = {}) {
  const p = load(opts);
  const dark = /** @type {string[]} */ (p.meta.dark ?? []);
  const reviewLit = !dark.includes('review status');
  // Ruled (campaign F4): a corpus with no design tier at all is one fact —
  // the per-scenario unrefined flood is suppressed and the absence named in
  // limitations; every other tier keeps ranking normally.
  const conditions = /** @type {Array<{kind: string, statement: string}>} */ (
    p.meta.conditions ?? []);
  const tierAbsent = conditions.find((c) => c.kind === 'design-tier-absent');

  const scenarios = p.nodes.filter((n) => n.kind === 'scenario');
  const refinedFrom = new Set(p.edges.filter((e) => e.class === 'refinement').map((e) => e.src));
  const refinedTo = new Set(p.edges.filter((e) => e.class === 'refinement').map((e) => e.dst));
  const fenceByDst = new Map(p.nodes.filter((n) => n.kind === 'fence_ruling').map((n) => [n.id, n]));
  const regions = p.nodes.filter((n) => n.kind === 'region');

  // contested-region membership, for the pile-up rule
  /** @type {Map<string, Array<{sessionId: string, excerpts: string[]}>>} keyed `file title` */
  const contestedOf = new Map();
  for (const r of regions) {
    const data = /** @type {{state: string, sessionId: string, sampleExcerpts: string[], correlated: Array<{file: string, title: string}>}} */ (r.data);
    if (data.state !== 'contested') continue;
    for (const c of data.correlated) {
      const k = `${c.file} ${c.title}`;
      const arr = contestedOf.get(k) ?? [];
      arr.push({ sessionId: data.sessionId, excerpts: data.sampleExcerpts });
      contestedOf.set(k, arr);
    }
  }

  // --- per-scenario signals -------------------------------------------------
  /** @type {Array<{tier: Tier, item: Omit<AttentionItem, 'rank' | 'tier'>}>} */
  const scenarioItems = [];
  /** @type {Set<string>} scenario keys absorbed into a higher tier than contested */
  const absorbedContested = new Set();
  for (const n of scenarios) {
    const d = /** @type {{file: string, title: string, tier: string, bindingStatus: string | null,
      review?: import('./review').ReviewState, rulingCandidates?: unknown,
      dilution?: {signals: Array<{signal: string, evidence: Record<string, unknown>}>}}} */ (n.data);
    /** @type {Array<{tier: Tier | null, signal: string, evidence: Record<string, unknown>}>} */
    const signals = [];

    for (const e of p.edges) {
      if (e.class !== 'fence' || e.src !== n.id) continue;
      const fence = fenceByDst.get(e.dst);
      const topic = fence === undefined ? '?' : /** @type {{topic: string}} */ (fence.data).topic;
      const ed = /** @type {{kind: string, score: number, predates: boolean}} */ (e.data);
      // Guardianship is a citation, not a defect: it assigns no tier.
      if (ed.kind === 'guardian') continue;
      signals.push({
        tier: ed.kind === 'breach' ? 'breach' : 'possible-breach',
        signal: ed.kind === 'breach' ? 'fence breach' : 'possible fence breach',
        evidence: { fence: topic, score: ed.score, predates: ed.predates, scenario: d.title },
      });
    }
    const review = d.review;
    if (review?.status === 'reviewed-then-changed' && review.change !== null
      && review.change.sanctioned !== true) {
      const quiet = !review.change.declared;
      signals.push({
        tier: quiet ? 'quiet-edit' : 'declared-edit',
        signal: quiet ? 'changed without traced discussion' : 'declared change after review',
        evidence: { ruling: review.ruling, change: review.change },
      });
    }
    const dil = /** @type {{signals?: Array<{signal: string, evidence: Record<string, unknown>}>} | undefined} */ (
      d.dilution);
    for (const ds of dil?.signals ?? []) {
      signals.push({ tier: dilutionTier(ds.signal), signal: ds.signal, evidence: ds.evidence });
    }
    if (d.bindingStatus === 'never-run') {
      signals.push({
        tier: 'never-run',
        signal: 'never run',
        evidence: { statement: 'absent from the run manifest — coverage that never ran' },
      });
    }
    if (d.tier === 'design' && !refinedFrom.has(n.id)) {
      signals.push({
        tier: 'orphan',
        signal: 'orphan',
        evidence: { statement: 'design scenario with no traced intent' },
      });
    }
    if (d.tier === 'uat' && tierAbsent === undefined && !refinedTo.has(n.id)) {
      signals.push({
        tier: 'unrefined',
        signal: 'unrefined intent',
        evidence: { statement: 'declared intent no design scenario refines' },
      });
    }
    for (const region of contestedOf.get(`${d.file} ${d.title}`) ?? []) {
      signals.push({
        tier: null, // region-keyed: the region item carries the tier
        signal: 'contested',
        evidence: { region: region.sessionId, excerpts: region.excerpts },
      });
    }
    if (reviewLit && review?.status !== 'reviewed') {
      signals.push({
        tier: null,
        signal: 'unreviewed',
        evidence: { statement: 'no ruling evidence marks this scenario reviewed' },
      });
    }

    const itemTiers = signals.filter((s) => s.tier !== null);
    if (itemTiers.length === 0) continue;
    itemTiers.sort((a, b) => TIERS.indexOf(/** @type {Tier} */(a.tier)) - TIERS.indexOf(/** @type {Tier} */(b.tier)));
    const top = itemTiers[0];
    // A region is absorbed only into a HIGHER tier than its own — a
    // confirmation-tier item (below contested, R9) must not swallow the
    // region's ranking; the contested signal still rides as evidence.
    if (signals.some((s) => s.signal === 'contested')
      && TIERS.indexOf(/** @type {Tier} */ (top.tier)) < TIERS.indexOf('contested')) {
      absorbedContested.add(`${d.file} ${d.title}`);
    }
    scenarioItems.push({
      tier: /** @type {Tier} */ (top.tier),
      item: {
        kind: 'scenario',
        file: d.file,
        title: d.title,
        evidence: top.evidence,
        absorbed: signals.filter((s) => s !== top)
          .map((s) => ({ signal: s.signal, evidence: s.evidence })),
      },
    });
  }

  // --- outlines: the mass-series face of dilution (rows, R14) ---------------
  for (const n of p.nodes.filter((x) => x.kind === 'outline')) {
    const d = /** @type {{file: string, title: string,
      dilution?: {signals: Array<{signal: string, evidence: Record<string, unknown>}>}}} */ (n.data);
    const list = d.dilution?.signals ?? [];
    if (list.length === 0) continue;
    const tiered = list.map((ds) => ({ tier: dilutionTier(ds.signal), signal: ds.signal, evidence: ds.evidence }))
      .sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
    const top = tiered[0];
    scenarioItems.push({
      tier: top.tier,
      item: {
        kind: 'scenario',
        file: d.file,
        title: d.title,
        evidence: top.evidence,
        absorbed: tiered.slice(1).map((ds) => ({ signal: ds.signal, evidence: ds.evidence })),
      },
    });
  }

  // --- closed threads: removals ---------------------------------------------
  for (const n of p.nodes.filter((x) => x.kind === 'closed_scenario')) {
    const d = /** @type {{file: string, title: string, reason: string, closedAt: {date: string},
      reviewedAtClosure?: boolean, removalDeclared?: boolean, ruling?: unknown,
      sanctionedDeletion?: {entryDate: string | null, retired: boolean}}} */ (n.data);
    if (d.sanctionedDeletion !== undefined) {
      // R18: the thread end spent the deletes-scenario sanction — a
      // confirmation while the deletion is the corpus's latest word, gone
      // at the next recorded run. Never a quiet removal.
      if (d.sanctionedDeletion.retired) continue;
      scenarioItems.push({
        tier: 'confirmation',
        item: {
          kind: 'closed',
          file: d.file,
          title: d.title,
          evidence: {
            statement: 'sanctioned deletion landed as ruled',
            entryDate: d.sanctionedDeletion.entryDate,
            closedAt: d.closedAt.date,
          },
          absorbed: [],
        },
      });
      continue;
    }
    if (d.reviewedAtClosure !== true) continue;
    scenarioItems.push({
      tier: d.removalDeclared === true ? 'declared-edit' : 'quiet-removal',
      item: {
        kind: 'closed',
        file: d.file,
        title: d.title,
        evidence: {
          statement: 'reviewed intent removed',
          reason: d.reason,
          closedAt: d.closedAt.date,
          ruling: d.ruling ?? null,
        },
        absorbed: [],
      },
    });
  }

  // --- fence pressure --------------------------------------------------------
  /** @type {Array<{tier: Tier, item: Omit<AttentionItem, 'rank' | 'tier'>}>} */
  const otherItems = [];
  for (const n of p.nodes.filter((x) => x.kind === 'fence_ruling')) {
    const d = /** @type {{topic: string, pressure: null | {entries: unknown[], ask: string}}} */ (n.data);
    if (d.pressure === null) continue;
    otherItems.push({
      tier: 'pressure',
      item: {
        kind: 'fence',
        topic: d.topic,
        evidence: { entries: d.pressure.entries, ask: d.pressure.ask },
        absorbed: [],
      },
    });
  }

  // --- contested regions (unless absorbed into a higher-tier scenario) ------
  let contestedAbsorbed = 0;
  for (const r of regions) {
    const d = /** @type {{state: string, sessionId: string, entryCount: number,
      sampleExcerpts: string[], entryIds: string[], correlated: Array<{file: string, title: string}>}} */ (r.data);
    if (d.state !== 'contested' && d.state !== 'uncaptured') continue;
    if (d.state === 'contested') {
      // Absorbed only when EVERY correlated scenario is itself a listed
      // item — partial absorption must not erase the region's evidence for
      // scenarios that appear nowhere (adversarial catch).
      const fullyAbsorbed = d.correlated.length > 0
        && d.correlated.every((c) => absorbedContested.has(`${c.file} ${c.title}`));
      if (fullyAbsorbed) {
        contestedAbsorbed++;
        continue;
      }
    }
    otherItems.push({
      tier: d.state === 'contested' ? 'contested' : 'uncaptured',
      item: {
        kind: 'region',
        sessionId: d.sessionId,
        evidence: {
          entryCount: d.entryCount,
          excerpts: d.sampleExcerpts,
          entries: d.entryIds,
          correlated: d.correlated,
        },
        absorbed: [],
      },
    });
  }

  // --- assemble: tier blocks, ranked flat list ------------------------------
  const all = [...scenarioItems, ...otherItems];
  /** @type {AttentionItem[]} */
  const items = [];
  const tierBlocks = [];
  for (const tier of TIERS) {
    const mine = all.filter((x) => x.tier === tier).map((x) => x.item)
      .sort((a, b) => compareCodePoints(a.file ?? a.topic ?? a.sessionId ?? '', b.file ?? b.topic ?? b.sessionId ?? '')
        || compareCodePoints(a.title ?? '', b.title ?? ''));
    // absorbed counts: for the contested tier, count fully-absorbed REGIONS
    // (never also their member signals — that double-counted); for scenario
    // tiers, count signals displayed beneath higher items.
    let absorbedCount = contestedAbsorbed !== 0 && tier === 'contested' ? contestedAbsorbed : 0;
    if (tier !== 'contested') {
      for (const x of all) {
        if (TIERS.indexOf(x.tier) >= TIERS.indexOf(tier)) continue;
        absorbedCount += x.item.absorbed.filter((s) => signalTier(s.signal) === tier).length;
      }
    }
    /** @type {Map<string, number>} */
    const groupMap = new Map();
    for (const it of mine) {
      if (it.file === undefined) continue;
      groupMap.set(it.file, (groupMap.get(it.file) ?? 0) + 1);
    }
    const groups = [...groupMap.entries()]
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count || compareCodePoints(a.file, b.file));
    tierBlocks.push({
      tier,
      count: mine.length,
      absorbed: absorbedCount,
      groups,
      largestCluster: groups.length > 0 ? groups[0] : null,
    });
    for (const it of mine) {
      items.push({ tier, rank: items.length, ...it });
    }
  }

  /** @type {string[]} */
  const limitations = [];
  for (const signal of dark) {
    limitations.push(`${signal} dark — this list cannot see it`);
  }
  if (tierAbsent !== undefined) {
    limitations.push(tierAbsent.statement);
  }
  // Collapsed saturation no longer rides in notes (single-source ruling) —
  // its statement is a mining-completeness limitation and enters here from
  // the structured channel; itemized saturation still arrives via the
  // per-title notes filter below.
  for (const c of conditions) {
    if (c.kind === 'provenance-saturation') limitations.push(c.statement);
  }
  if (p.meta.heatWithheld === true) {
    limitations.push('heat classification was withheld — no natural break in discussion density');
  }
  const exceptions = /** @type {Array<{file: string}>} */ (p.meta.exceptions ?? []);
  if (exceptions.length > 0) {
    limitations.push(
      `${exceptions.length} feature file(s) are excepted from the picture — `
      + 'their scenarios are invisible to this list');
  }
  for (const note of /** @type {string[]} */ (p.meta.notes ?? [])) {
    if (note.includes('invisible to density counting') || note.includes('may be unlinked')
      || note.includes('may be unlisted') || note.includes('no session id')) {
      limitations.push(note);
    }
  }

  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    items,
    tiers: tierBlocks,
    limitations,
  };
}

/** @param {string} signal @returns {Tier | null} */
function signalTier(signal) {
  switch (signal) {
    case 'fence breach': return 'breach';
    case 'possible fence breach': return 'possible-breach';
    case 'changed without traced discussion': return 'quiet-edit';
    case 'declared change after review': return 'declared-edit';
    case 'never run': return 'never-run';
    case 'orphan': return 'orphan';
    case 'unrefined intent': return 'unrefined';
    case 'contested': return 'contested';
    default: return dilutionTier2(signal);
  }
}

/**
 * Dilution signal → its R9 rung. Confirmations and unconsumed notices
 * share the bottom tier; their lifetimes differ upstream (R17 asymmetry —
 * the notice stands until the entry resolves, the confirmation retires at
 * the next verdict) and are enforced where the signals are derived.
 * @param {string} signal @returns {Tier}
 */
function dilutionTier(signal) {
  switch (signal) {
    case 'sanction violation': return 'sanction-violation';
    case 'verdict-coupled edit': return 'verdict-coupled';
    case 'assertion decline': return 'assertion-decline';
    case 'sanction confirmation':
    case 'unconsumed sanction':
    default: return 'confirmation';
  }
}

/** @param {string} signal @returns {Tier | null} */
function dilutionTier2(signal) {
  switch (signal) {
    case 'sanction violation':
    case 'verdict-coupled edit':
    case 'assertion decline':
    case 'sanction confirmation':
    case 'unconsumed sanction':
      return dilutionTier(signal);
    default: return null;
  }
}

module.exports = { queryAttention };
