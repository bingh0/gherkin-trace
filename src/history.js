'use strict';
const { execFileSync } = require('node:child_process');
const { sha256, compareCodePoints, jkey } = require('./util');

// Scenario timelines mined from git history — the identity machinery.
//
// Gherkin has no stable scenario IDs; identity is file path + title, tracked
// through git history for renames and moves (design ruling, external-first).
// Change dating is git intervals only, never filesystem mtime: a committed
// change is dated by the commit that touched the scenario, an uncommitted
// change is an interval (last commit → refresh), never flattened to a date.
//
// The floors are contract: a body-untouched rename confirms (identity and
// links survive); an unconfirmable rename is a visible break — the old
// thread closes, the new scenario starts fresh, and candidates are offered
// with evidence, never silently adopted.

/** @typedef {{ file: string, title: string, bodyHash: string, steps: string[] }} SnapEntry */
/**
 * @typedef {{
 *   event: 'created' | 'changed' | 'renamed',
 *   commit: string,
 *   date: string,
 *   from?: { file: string, title: string },
 * }} TimelineEvent
 */
/**
 * @typedef {{
 *   events: TimelineEvent[],
 *   formerTitles: Array<{ file: string, title: string }>,
 *   uncommittedChange: boolean,
 *   lastCommittedChange: string | null,
 *   healedBy?: string,
 *   mass: Array<{ commit: string, date: string, thens: number }>,
 * }} Timeline
 */
/**
 * @typedef {{
 *   file: string, title: string,
 *   closedAt: { commit: string, date: string },
 *   reason: 'deleted' | 'unconfirmed-rename',
 *   candidates: Array<{ file: string, title: string, evidence: Record<string, unknown> }>,
 * }} ClosedThread
 */
/**
 * @typedef {{
 *   available: boolean,
 *   timelines: Map<string, Timeline>,
 *   closed: ClosedThread[],
 *   skipped: { commits: number, blobs: number },
 *   outlineSeries: Map<string, Array<{ commit: string, date: string, rows: number }>>,
 * }} History
 */

/**
 * An outline's watched identity is its base name: the trailing
 * placeholder segment (` [<n>]`) that disambiguates expanded row titles
 * is stripped, so the outline, its manifest rows, and the visionary's
 * vocabulary all name the same thing (dilution R14).
 * @param {string} name
 */
function outlineBase(name) {
  return name.replace(/ \[[^\]]*\]$/, '');
}

/**
 * Resolved-Then count — the scenario's assertion mass (dilution R14/R22).
 * Steps carry literal keywords; And/But/* inherit the preceding primary.
 * @param {string[]} steps `${keyword} ${text}` lines
 */
function thenCount(steps) {
  let primary = '';
  let count = 0;
  for (const s of steps) {
    const kw = s.split(' ', 1)[0];
    if (kw === 'Given' || kw === 'When' || kw === 'Then') primary = kw;
    if (primary === 'Then') count++;
  }
  return count;
}

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {string | null} stdout, or null when git itself refuses
 */
function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * Mine the git history of the features directory into per-scenario
 * timelines. `current` is the working-tree corpus (file → scenarios with
 * body hashes) the refresh already parsed; the working tree is the final,
 * possibly-uncommitted snapshot.
 *
 * A project without git history is not an error: identity starts at the
 * present, and the caller names rename tracking dark.
 * @param {string} root
 * @param {string} featuresRel root-relative POSIX path of the features dir
 * @param {Map<string, SnapEntry>} current working-tree snapshot keyed `file#title`
 * @param {Array<{ from: {file: string, title: string}, to: {file: string, title: string}, ruling: string }>} [healings]
 *   user-ruled rename confirmations mined from the journal
 * @param {Map<string, number>} [currentOutlines] working-tree outline rows keyed `file#outlineName`
 * @returns {History}
 */
function collectHistory(root, featuresRel, current, healings = [], currentOutlines = new Map()) {
  // --first-parent linearizes merges: a change made on a side branch is
  // dated at its merge commit. That can only postdate the true touch, so
  // review expiry errs conservative (false expiry = one cheap re-glance).
  const log = git(root, ['log', '--first-parent', '--reverse', '--format=%H %cI', '--', featuresRel]);
  if (log === null || log.trim() === '') {
    return { available: false, timelines: new Map(), closed: [], skipped: { commits: 0, blobs: 0 }, outlineSeries: new Map() };
  }
  const commits = log.trim().split('\n').map((l) => {
    const sp = l.indexOf(' ');
    return { hash: l.slice(0, sp), date: toUtc(l.slice(sp + 1)) };
  });

  // Parse every distinct blob once; snapshots share parses across commits.
  /** @type {Map<string, import('gherkin-node-test').ParsedFeature | null>} */
  const blobCache = new Map();
  /** @type {Array<{ commit: string, date: string, snap: Map<string, SnapEntry>, outlines: Map<string, number> }>} */
  const snapshots = [];
  const skipped = { commits: 0, blobs: 0 };
  for (const c of commits) {
    const tree = git(root, ['ls-tree', '-r', c.hash, '--', featuresRel]);
    if (tree === null) {
      skipped.commits++;
      continue;
    }
    /** @type {Map<string, SnapEntry>} */
    const snap = new Map();
    /** @type {Map<string, number>} */
    const outlines = new Map();
    const prevSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1].snap : null;
    for (const line of tree.trim().split('\n')) {
      if (line === '') continue;
      const m = /^\S+ blob (\S+)\t(.+)$/.exec(line);
      if (!m || !m[2].endsWith('.feature')) continue;
      const [, blob, file] = m;
      if (!blobCache.has(blob)) blobCache.set(blob, parseBlob(root, blob, file));
      const parsed = blobCache.get(blob);
      if (!parsed) {
        // An unparseable historical version is UNKNOWN, not absent: carry
        // the file's previous entries forward, else one transiently broken
        // commit would manufacture permanent false deleted+created breaks
        // for every scenario in the file (adversarial catch, empirical).
        skipped.blobs++;
        if (prevSnap !== null) {
          for (const [k, e] of prevSnap) {
            if (e.file === file) snap.set(k, e);
          }
        }
        continue;
      }
      for (const s of parsed.scenarios) {
        const steps = s.steps.map((st) => `${st.keyword} ${st.text}`);
        snap.set(jkey(file, s.name), {
          file,
          title: s.name,
          bodyHash: sha256(steps.join('\n')),
          steps,
        });
      }
      for (const o of parsed.outlines) {
        outlines.set(jkey(file, outlineBase(o.name)), o.rows);
      }
    }
    snapshots.push({ commit: c.hash, date: c.date, snap, outlines });
  }
  snapshots.push({ commit: '', date: '', snap: current, outlines: currentOutlines });

  // Outline row series (dilution R14): rows joining or leaving an outline
  // are assertion mass, never scenario removal — one point per change.
  /** @type {Map<string, Array<{ commit: string, date: string, rows: number }>>} */
  const outlineSeries = new Map();
  for (const s of snapshots) {
    for (const [key, rows] of s.outlines) {
      const arr = outlineSeries.get(key) ?? [];
      if (arr.length === 0 || arr[arr.length - 1].rows !== rows) {
        arr.push({ commit: s.commit, date: s.date, rows });
      }
      outlineSeries.set(key, arr);
    }
  }

  /** @type {Map<string, string>} healing lookup: `from.file#from.title` → `to.file#to.title` */
  const healed = new Map();
  /** @type {Map<string, string>} ruling pointer per healed pair */
  const healingRuling = new Map();
  for (const h of healings) {
    const fromKey = jkey(h.from.file, h.from.title);
    healed.set(fromKey, jkey(h.to.file, h.to.title));
    healingRuling.set(fromKey, h.ruling);
  }

  // Walk consecutive snapshots; thread identities forward.
  /** @type {Map<string, Timeline>} keyed by the scenario's CURRENT key */
  const timelines = new Map();
  /** @type {ClosedThread[]} */
  const closed = [];
  /** @type {Map<string, string>} live thread: snapshot key → timeline key (rebound on rename) */
  let alive = new Map();

  for (let i = 0; i < snapshots.length; i++) {
    const { commit, date, snap } = snapshots[i];
    const prev = i === 0 ? null : snapshots[i - 1];
    const isWorkingTree = i === snapshots.length - 1;

    /** @type {Map<string, string>} */
    const nextAlive = new Map();
    /** @type {Array<{ key: string, entry: SnapEntry }>} */
    const appeared = [];
    /** @type {Array<{ key: string, entry: SnapEntry, timelineKey: string }>} */
    const vanished = [];

    for (const [key, entry] of sortedEntries(snap)) {
      if (prev === null) {
        startThread(timelines, nextAlive, key, { event: 'created', commit, date }, entry);
        continue;
      }
      const prevEntry = prev.snap.get(key);
      if (prevEntry !== undefined) {
        const tk = /** @type {string} */ (alive.get(key)) ?? key;
        nextAlive.set(key, tk);
        if (prevEntry.bodyHash !== entry.bodyHash) {
          appendEvent(timelines, tk, isWorkingTree
            ? { event: 'changed', commit: '', date: '' }
            : { event: 'changed', commit, date });
          if (!isWorkingTree) appendMass(timelines, tk, commit, date, entry);
        }
      } else {
        appeared.push({ key, entry });
      }
    }
    if (prev !== null) {
      for (const [key, entry] of sortedEntries(prev.snap)) {
        if (!snap.has(key)) {
          vanished.push({ key, entry, timelineKey: /** @type {string} */ (alive.get(key)) ?? key });
        }
      }

      // Confirmed renames: one-to-one body-hash match between a vanished and
      // an appeared scenario — AND the hash must be unique across the whole
      // snapshot on both sides. A persisting same-body sibling makes the
      // "rename" indistinguishable from a copy of that sibling, and a wrong
      // guess would transfer review status to a scenario the human never
      // ruled on (the fenced failure; adversarial catch, empirical).
      const byHash = groupBy(vanished, (v) => String(v.entry.bodyHash));
      /** @type {Set<string>} */
      const consumedVanished = new Set();
      /** @type {Set<string>} */
      const consumedAppeared = new Set();
      const appearedByHash = groupBy(appeared, (a) => String(a.entry.bodyHash));
      /** @type {Map<string, number>} */
      const prevHashCount = new Map();
      for (const e of prev.snap.values()) {
        prevHashCount.set(e.bodyHash, (prevHashCount.get(e.bodyHash) ?? 0) + 1);
      }
      /** @type {Map<string, number>} */
      const curHashCount = new Map();
      for (const e of snap.values()) {
        curHashCount.set(e.bodyHash, (curHashCount.get(e.bodyHash) ?? 0) + 1);
      }
      for (const [hash, olds] of byHash) {
        const news = appearedByHash.get(hash) ?? [];
        if (olds.length === 1 && news.length === 1
          && prevHashCount.get(hash) === 1 && curHashCount.get(hash) === 1) {
          const [oldOne] = olds;
          const [newOne] = news;
          appendEvent(timelines, oldOne.timelineKey, {
            event: 'renamed',
            commit: isWorkingTree ? '' : commit,
            date: isWorkingTree ? '' : date,
            from: { file: oldOne.entry.file, title: oldOne.entry.title },
          });
          rebindThread(timelines, oldOne.timelineKey, newOne.key);
          nextAlive.set(newOne.key, newOne.key);
          consumedVanished.add(oldOne.key);
          consumedAppeared.add(newOne.key);
        }
      }

      // User-ruled healings: a journal ruling confirms a rename the bytes
      // could not — identity follows, and the reconnection cites the ruling.
      for (const v of vanished) {
        if (consumedVanished.has(v.key)) continue;
        const toKey = healed.get(v.key);
        if (toKey !== undefined && snap.has(toKey)) {
          appendEvent(timelines, v.timelineKey, {
            event: 'renamed',
            commit: isWorkingTree ? '' : commit,
            date: isWorkingTree ? '' : date,
            from: { file: v.entry.file, title: v.entry.title },
          });
          // A healed rename may carry body edits (that is exactly why the
          // bytes could not confirm it): the edit is a change event, so
          // review expires to reviewed-then-changed as the derivable
          // middle-band outcome.
          const target = /** @type {SnapEntry} */ (snap.get(toKey));
          if (target.bodyHash !== v.entry.bodyHash) {
            appendEvent(timelines, v.timelineKey, {
              event: 'changed',
              commit: isWorkingTree ? '' : commit,
              date: isWorkingTree ? '' : date,
            });
            if (!isWorkingTree) appendMass(timelines, v.timelineKey, commit, date, target);
          }
          const tl = timelines.get(v.timelineKey);
          if (tl) tl.healedBy = healingRuling.get(v.key);
          rebindThread(timelines, v.timelineKey, toKey);
          nextAlive.set(toKey, toKey);
          consumedVanished.add(v.key);
          consumedAppeared.add(toKey);
        }
      }

      // Everything else: vanished threads close visibly; appeared scenarios
      // start fresh, with candidates offered where the evidence suggests a
      // rename that could not be confirmed.
      for (const v of vanished) {
        if (consumedVanished.has(v.key)) continue;
        const candidates = appeared
          .filter((a) => !consumedAppeared.has(a.key))
          .map((a) => ({ to: a, evidence: similarity(v.entry, a.entry) }))
          .filter((c) => c.evidence.titleOverlap >= 0.5 || c.evidence.stepOverlap >= 0.5);
        closed.push({
          file: v.entry.file,
          title: v.entry.title,
          closedAt: { commit, date },
          reason: candidates.length > 0 ? 'unconfirmed-rename' : 'deleted',
          candidates: candidates.map((c) => ({
            file: c.to.entry.file,
            title: c.to.entry.title,
            evidence: c.evidence,
          })),
        });
        timelines.delete(v.timelineKey);
      }
      for (const a of appeared) {
        if (consumedAppeared.has(a.key)) continue;
        startThread(timelines, nextAlive, a.key, isWorkingTree
          ? { event: 'created', commit: '', date: '' }
          : { event: 'created', commit, date }, a.entry);
      }
    }
    alive = nextAlive;
  }

  // Finalize: former titles and dating flags per surviving thread.
  for (const tl of timelines.values()) {
    tl.formerTitles = tl.events
      .filter((e) => e.event === 'renamed' && e.from)
      .map((e) => /** @type {{file: string, title: string}} */ (e.from));
    const committedChanges = tl.events.filter((e) => e.date !== '' && e.event !== 'renamed');
    tl.lastCommittedChange = committedChanges.length > 0
      ? committedChanges[committedChanges.length - 1].date
      : null;
    // A body-untouched working-tree rename is not a body change.
    tl.uncommittedChange = tl.events.some((e) => e.date === '' && e.event !== 'renamed');
  }

  return { available: true, timelines, closed, skipped, outlineSeries };
}

/**
 * @param {string} root @param {string} blob @param {string} file
 * @returns {import('gherkin-node-test').ParsedFeature | null}
 */
function parseBlob(root, blob, file) {
  const text = git(root, ['cat-file', 'blob', blob]);
  if (text === null) return null;
  try {
    const { parseFeature } = require('gherkin-node-test');
    return parseFeature(text, file);
  } catch {
    return null;
  }
}

/**
 * Rename-candidate evidence: token overlap of titles and step-set overlap,
 * both Dice coefficients — deterministic and cheap. Evidence is displayed,
 * never used to silently adopt a link.
 * @param {SnapEntry} a @param {SnapEntry} b
 * @returns {{ titleOverlap: number, stepOverlap: number }}
 */
function similarity(a, b) {
  return {
    titleOverlap: round3(dice(tokens(a.title), tokens(b.title))),
    stepOverlap: round3(dice(new Set(a.steps), new Set(b.steps))),
  };
}

/** @param {Set<string>} a @param {Set<string>} b @returns {number} */
function dice(a, b) {
  if (a.size + b.size === 0) return 0;
  const shared = [...a].filter((t) => b.has(t)).length;
  return (2 * shared) / (a.size + b.size);
}

/** @param {string} s @returns {Set<string>} */
function tokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0));
}

/** @param {number} n */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * @param {Map<string, Timeline>} timelines @param {Map<string, string>} nextAlive
 * @param {string} key @param {TimelineEvent} event
 * @param {SnapEntry} [entry] present snapshot entry, for the mass series
 */
function startThread(timelines, nextAlive, key, event, entry) {
  timelines.set(key, {
    events: [event],
    formerTitles: [],
    uncommittedChange: false,
    lastCommittedChange: null,
    mass: entry !== undefined && event.date !== ''
      ? [{ commit: event.commit, date: event.date, thens: thenCount(entry.steps) }]
      : [],
  });
  nextAlive.set(key, key);
}

/** @param {Map<string, Timeline>} timelines @param {string} key @param {TimelineEvent} event */
function appendEvent(timelines, key, event) {
  const tl = timelines.get(key);
  if (tl) tl.events.push(event);
}

/**
 * Committed mass point on a change — uncommitted edits stay out of the
 * series (their order is not establishable; dilution states that).
 * @param {Map<string, Timeline>} timelines @param {string} key
 * @param {string} commit @param {string} date @param {SnapEntry} entry
 */
function appendMass(timelines, key, commit, date, entry) {
  const tl = timelines.get(key);
  if (tl && date !== '') {
    tl.mass.push({ commit, date, thens: thenCount(entry.steps) });
  }
}

/** @param {Map<string, Timeline>} timelines @param {string} fromKey @param {string} toKey */
function rebindThread(timelines, fromKey, toKey) {
  const tl = timelines.get(fromKey);
  if (tl) {
    timelines.delete(fromKey);
    timelines.set(toKey, tl);
  }
}

/**
 * @template T
 * @param {Map<string, T>} m
 * @returns {Array<[string, T]>} entries in code-point key order — determinism
 */
function sortedEntries(m) {
  return [...m.entries()].sort((a, b) => compareCodePoints(a[0], b[0]));
}

/**
 * @template T
 * @param {T[]} items @param {(t: T) => string} keyFn
 * @returns {Map<string, T[]>}
 */
function groupBy(items, keyFn) {
  /** @type {Map<string, T[]>} */
  const out = new Map();
  for (const it of items) {
    const k = keyFn(it);
    const arr = out.get(k);
    if (arr) arr.push(it);
    else out.set(k, [it]);
  }
  return out;
}

/** @param {string} iso @returns {string} ISO instant in UTC, seconds resolution */
function toUtc(iso) {
  return new Date(iso.trim()).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = { collectHistory, outlineBase };
