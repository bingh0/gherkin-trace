'use strict';
const { compareCodePoints, jkey } = require('./util');
const { isoOf } = require('./review');

// Conversation heat — the five-state taxonomy (visionary-ratified):
//   settled     heavy discussion → spec changed → discussion stopped
//   contested   discussion outlives the last spec change / ruling      HOT
//   uncaptured  heavy discussion, no scenarios at all                  HOTTEST
//   unexamined  little discussion, little spec                        UNKNOWN
//   quiet       little discussion, stable reviewed spec
// The discriminator is temporal order; "heavy" is distribution-relative,
// cut at the natural break — no thresholds to tune. A distribution without
// a natural break WITHHOLDS heat classification and says so: manufactured
// silence is fenced.
//
// Region formation (implementation-tier; granularity consciously unpinned,
// see OUT-OF-SCOPE deferred): a region is a journal SESSION — the
// deterministic discussion unit treecontext already stamps on every entry.
// Field runs on the dogfood corpus decide whether granularity graduates.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'was', 'are', 'were',
  'for', 'on', 'with', 'that', 'this', 'it', 'as', 'be', 'we', 'our', 'not',
  'but', 'its', 'into', 'here', 'have', 'has', 'had', 'about', 'all', 'most',
]);

/**
 * @typedef {{
 *   sessionId: string,
 *   entryCount: number,
 *   entryIds: string[],
 *   sampleExcerpts: string[],
 *   terms: string[],
 *   correlated: Array<{file: string, title: string}>,
 *   lastEntryAt: string,
 *   specBoundary: string | null,
 *   heavy: boolean,
 *   state: 'settled' | 'contested' | 'uncaptured' | 'unexamined' | 'quiet' | 'withheld' | 'fenced',
 *   flag: 'hot' | 'hottest' | 'unknown' | null,
 *   boundaryOpen: boolean,
 *   suppressedBy?: { topic: string, line: number, effectiveDate: string | null },
 * }} Region
 */

/**
 * @param {{
 *   allEntries: import('./review').MinedEntry[],
 *   corpus: Array<{key: string, file: string, title: string}>,
 *   mentionsByKey: Map<string, import('./review').MinedEntry[]>,
 *   reviewByKey: Map<string, import('./review').ReviewState>,
 *   timelines: Map<string, import('./history').Timeline>,
 * }} input
 * @returns {{ regions: Region[], withheld: boolean }}
 */
function computeHeat({ allEntries, corpus, mentionsByKey, reviewByKey, timelines }) {
  /** @type {Map<string, import('./review').MinedEntry[]>} */
  const bySession = new Map();
  for (const e of allEntries) {
    if (e.sessionId === null) continue;
    const arr = bySession.get(e.sessionId) ?? [];
    arr.push(e);
    bySession.set(e.sessionId, arr);
  }

  // Correlation: a scenario belongs to a region when any of its mention
  // entries lives in that session.
  /** @type {Map<string, Array<{key: string, file: string, title: string}>>} */
  const correlatedBySession = new Map();
  for (const c of corpus) {
    /** @type {Set<string>} */
    const seen = new Set();
    for (const m of mentionsByKey.get(c.key) ?? []) {
      if (m.sessionId === null || seen.has(m.sessionId)) continue;
      seen.add(m.sessionId);
      const arr = correlatedBySession.get(m.sessionId) ?? [];
      arr.push(c);
      correlatedBySession.set(m.sessionId, arr);
    }
  }

  const sessionIds = [...bySession.keys()].sort(compareCodePoints);
  const counts = sessionIds.map((s) => /** @type {import('./review').MinedEntry[]} */ (bySession.get(s)).length);
  const cut = naturalBreak(counts);
  const withheld = cut === null;

  /** @type {Region[]} */
  const regions = [];
  for (const sessionId of sessionIds) {
    const entries = /** @type {import('./review').MinedEntry[]} */ (bySession.get(sessionId));
    const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt || compareCodePoints(a.tcNodeId, b.tcNodeId));
    const correlated = (correlatedBySession.get(sessionId) ?? [])
      .slice()
      .sort((a, b) => compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title));
    const lastEntryAt = isoOf(sorted[sorted.length - 1].createdAt);

    // The temporal boundary discussion must not outlive: the latest spec
    // event or ruling among the region's scenarios. An uncommitted spec
    // event makes the boundary an OPEN interval — a contested reading is
    // then conservative, and the refresh says so.
    /** @type {string | null} */
    let specBoundary = null;
    let boundaryOpen = false;
    for (const c of correlated) {
      const tl = timelines.get(jkey(c.file, c.title));
      if (tl !== undefined) {
        for (const ev of tl.events) {
          if (ev.date === '' && ev.event !== 'renamed') boundaryOpen = true;
          if (ev.date !== '' && (specBoundary === null || ev.date > specBoundary)) specBoundary = ev.date;
        }
      }
      const review = reviewByKey.get(c.key);
      if (review?.ruling && (specBoundary === null || review.ruling.date > specBoundary)) {
        specBoundary = review.ruling.date;
      }
    }

    const heavy = !withheld && entries.length >= /** @type {number} */ (cut);
    /** @type {Region['state']} */
    let state;
    if (withheld) {
      state = 'withheld';
    } else if (heavy) {
      if (correlated.length === 0) state = 'uncaptured';
      else if (specBoundary === null || lastEntryAt > specBoundary) state = 'contested';
      else state = 'settled';
    } else {
      const allQuietlyReviewed = correlated.length > 0 && correlated.every((c) =>
        reviewByKey.get(c.key)?.status === 'reviewed');
      state = allQuietlyReviewed ? 'quiet' : 'unexamined';
    }
    /** @type {Region['flag']} */
    const flag = state === 'contested' ? 'hot'
      : state === 'uncaptured' ? 'hottest'
        : state === 'unexamined' ? 'unknown'
          : null;

    regions.push({
      sessionId,
      entryCount: entries.length,
      entryIds: sorted.map((e) => e.tcNodeId),
      sampleExcerpts: sorted.slice(0, 3).map((e) => e.excerpt),
      terms: topTerms(entries),
      correlated: correlated.map((c) => ({ file: c.file, title: c.title })),
      lastEntryAt,
      specBoundary,
      heavy,
      state,
      flag,
      boundaryOpen,
    });
  }
  return { regions, withheld };
}

/**
 * The natural break in discussion density. A candidate break is any gap in
 * the sorted counts that (a) is more than one entry wide, (b) dominates
 * every gap BELOW it (at least twice any tail gap — heavy sessions above
 * the break may differ among themselves without blinding the cut; the
 * adversarial probe [50,30,8,5,2] must break at 30|8, not withhold), and
 * (c) is large relative to the distribution's own scale (at least a
 * quarter of the max count — [40,38] is noise, not a break). The largest
 * valid candidate wins. No valid candidate → null: flat and near-flat
 * distributions withhold rather than fabricate.
 * @param {number[]} counts @returns {number | null}
 */
function naturalBreak(counts) {
  if (counts.length < 2) return null;
  const sorted = [...counts].sort((a, b) => b - a);
  /** @type {{ gap: number, idx: number } | null} */
  let best = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i] - sorted[i + 1];
    if (gap <= 1) continue;
    if (gap < sorted[0] / 4) continue;
    let tailMax = 0;
    for (let j = i + 1; j < sorted.length - 1; j++) {
      const t = sorted[j] - sorted[j + 1];
      if (t > tailMax) tailMax = t;
    }
    if (gap < 2 * tailMax) continue;
    if (best === null || gap > best.gap) best = { gap, idx: i };
  }
  return best === null ? null : sorted[best.idx];
}

/**
 * The region's own vocabulary: most frequent non-stopword terms, ties
 * alphabetical — deterministic, drawn from the discussion itself.
 * @param {import('./review').MinedEntry[]} entries @returns {string[]}
 */
function topTerms(entries) {
  /** @type {Map<string, number>} */
  const freq = new Map();
  for (const e of entries) {
    for (const t of e.content.toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length < 3 || STOPWORDS.has(t) || /^\d+$/.test(t)) continue;
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || compareCodePoints(a[0], b[0]))
    .slice(0, 6)
    .map(([t]) => t);
}

module.exports = { computeHeat, naturalBreak };
