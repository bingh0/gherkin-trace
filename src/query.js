'use strict';
const { load } = require('./trace');
const { compareCodePoints } = require('./util');
const { GtRefusal } = require('./errors');

/** @typedef {import('./sources').GtOptions} GtOptions */

/**
 * Orphan design scenarios: design-tier nodes with no traced UAT parent —
 * mechanics nobody asked for. Refuses with directions when no picture can
 * answer (never refreshed, broken, or first refresh still running).
 * @param {GtOptions} [opts]
 */
function queryOrphans(opts = {}) {
  const p = load(opts);
  const refined = new Set(p.edges.filter((e) => e.class === 'refinement').map((e) => e.src));
  const orphans = p.nodes
    .filter((n) => n.kind === 'scenario')
    .map((n) => ({ id: n.id, .../** @type {{file: string, title: string, tier: string}} */ (n.data) }))
    .filter((s) => s.tier === 'design' && !refined.has(s.id))
    .map((s) => ({ file: s.file, title: s.title }))
    .sort((a, b) => compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title));
  const exceptions = /** @type {Array<{statement: string}>} */ (p.meta.exceptions ?? []);
  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    limitations: exceptions.map((e) => e.statement),
    orphans,
  };
}

/**
 * The reviewed-set invariant check: the human's review budget, audited.
 * Small (count it) and intent-complete (every design scenario traces to a
 * reviewed scenario). Breakers are named, never summarized away. Over a
 * DARK review status it refuses — "reviewed set: 0" from an unmined
 * journal would be manufactured silence wearing numbers.
 * @param {GtOptions} [opts]
 */
function queryInvariant(opts = {}) {
  const p = load(opts);
  const dark = /** @type {string[]} */ (p.meta.dark ?? []);
  if (dark.includes('review status')) {
    throw new GtRefusal(
      'the reviewed set cannot be audited — review status is dark '
      + '(no journal was mined this refresh); a refresh with a journal restores the audit.');
  }
  const rows = p.nodes.filter((n) => n.kind === 'scenario');
  const scenarios = rows.map((r) => ({
    id: r.id,
    data: /** @type {{file: string, title: string, tier: string, review?: {status: string | null}}} */ (r.data),
  }));
  const reviewedIds = new Set(
    scenarios.filter((s) => s.data.review?.status === 'reviewed').map((s) => s.id));
  const reviewed = scenarios
    .filter((s) => reviewedIds.has(s.id))
    .map((s) => ({ file: s.data.file, title: s.data.title }))
    .sort((a, b) => compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title));

  const refinements = p.edges.filter((e) => e.class === 'refinement');
  /** @type {Map<number, number[]>} */
  const parentsOf = new Map();
  for (const e of refinements) {
    const arr = parentsOf.get(e.src) ?? [];
    arr.push(e.dst);
    parentsOf.set(e.src, arr);
  }
  /** @type {Array<{file: string, title: string, reason: string}>} */
  const breakers = [];
  for (const s of scenarios) {
    if (s.data.tier !== 'design') continue;
    const parents = parentsOf.get(s.id) ?? [];
    if (parents.length === 0) {
      breakers.push({ file: s.data.file, title: s.data.title, reason: 'no traced intent' });
    } else if (!parents.some((pid) => reviewedIds.has(pid))) {
      breakers.push({ file: s.data.file, title: s.data.title, reason: 'traces only to unreviewed intent' });
    }
  }
  breakers.sort((a, b) => compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title));
  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    reviewedSet: { count: reviewed.length, scenarios: reviewed },
    intentCoverage: { complete: breakers.length === 0, breakers },
  };
}

/**
 * Hot conversation, cold spec — the ruled agent query the design doc names.
 * Regions with their states, hottest first; withheld is stated, never
 * flattened into "nothing is hot".
 * @param {GtOptions} [opts]
 */
function queryHeat(opts = {}) {
  const p = load(opts);
  const dark = /** @type {string[]} */ (p.meta.dark ?? []);
  if (dark.includes('heat')) {
    throw new GtRefusal(
      'heat is dark — no journal was mined this refresh; a refresh with a journal restores it.');
  }
  const order = ['uncaptured', 'contested', 'settled', 'fenced', 'quiet', 'unexamined', 'withheld'];
  const regions = p.nodes.filter((n) => n.kind === 'region')
    .map((n) => /** @type {import('./heat').Region} */ (n.data))
    .map((r) => ({
      sessionId: r.sessionId,
      state: r.state,
      flag: r.flag,
      entryCount: r.entryCount,
      terms: r.terms,
      correlated: r.correlated,
      suppressedBy: r.suppressedBy ?? null,
    }))
    .sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state)
      || compareCodePoints(a.sessionId, b.sessionId));
  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    withheld: p.meta.heatWithheld === true,
    regions,
  };
}

/**
 * The dilution timeline — a lens on one scenario's full dated history:
 * edits and their commits, the assertion-count series, verdicts, sanction
 * entries and their consumption. It answers for ANY scenario the picture
 * holds, sightings or none (R21: absence is visible, never stated — and
 * never certified). A title matching nothing is a refusal naming the
 * title, with near-title candidates offered as evidence, never adopted
 * (R25 — an empty timeline for a typo'd title would read as a clean
 * history for a scenario nobody looked at).
 * @param {string} title
 * @param {GtOptions} [opts]
 */
function queryDilution(title, opts = {}) {
  const p = load(opts);
  const dark = /** @type {string[]} */ (p.meta.dark ?? []);
  if (dark.includes('dilution signals')) {
    throw new GtRefusal(
      'dilution signals are dark — no readable change history this refresh; '
      + 'a refresh inside a git repository restores them.');
  }
  const carriers = p.nodes.filter((n) => n.kind === 'scenario' || n.kind === 'outline')
    .map((n) => ({
      kind: n.kind,
      data: /** @type {{file: string, title: string,
        dilution?: {signals: Array<{signal: string, evidence: Record<string, unknown>}>},
        dilutionTimeline?: Array<Record<string, unknown>>}} */ (n.data),
    }));
  const hit = carriers.find((c) => c.data.title === title);
  if (hit !== undefined) {
    // R21's rejected road stays rejected: an unwatched scenario's timeline
    // would render exactly the pre-review motion the population ruling
    // (R7) excludes — refuse with the teaching, never render it.
    const watched = hit.kind === 'outline'
      ? /** @type {{watched?: boolean}} */ (hit.data).watched === true
      : /** @type {{review?: {status: string | null}}} */ (hit.data).review?.status != null;
    if (!watched) {
      throw new GtRefusal(
        `"${title}" is not watched — no review ruling or sanctioning entry anchors it; `
        + 'dilution watches reviewed scenarios only (pre-review motion is drafting).');
    }
  }
  if (hit === undefined) {
    const near = carriers
      .map((c) => ({ title: c.data.title, overlap: titleOverlap(title, c.data.title) }))
      .filter((c) => c.overlap >= 0.5)
      .sort((a, b) => b.overlap - a.overlap || compareCodePoints(a.title, b.title))
      .slice(0, 3)
      .map((c) => c.title);
    throw new GtRefusal(
      `no scenario carries the title "${title}" — nothing dilution-related to show`
      + (near.length > 0 ? `; nearest titles: ${near.map((t) => `"${t}"`).join(', ')}` : ''));
  }
  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    file: hit.data.file,
    title: hit.data.title,
    timeline: hit.data.dilutionTimeline ?? [],
    sightings: hit.data.dilution?.signals ?? [],
  };
}

/** @param {string} a @param {string} b */
function titleOverlap(a, b) {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0));
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0));
  if (ta.size === 0 || tb.size === 0) return 0;
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / Math.min(ta.size, tb.size);
}

module.exports = { queryOrphans, queryInvariant, queryHeat, queryDilution };
