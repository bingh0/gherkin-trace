'use strict';
const { compareCodePoints, excerpt } = require('./util');

// Corpus-level conditions — the aggregation ruling from the foreign-corpus
// campaign: a condition that holds corpus-wide is one fact, stated once,
// with its members kept — never N near-identical per-item diagnostics that
// bury every other line of the picture. Per-item disclosure collapses into
// a single corpus-level statement once more than COLLAPSE_AT items carry
// the same condition; below that, itemized disclosure stays sharper.
//
// Conditions are the single source: their statements are NOT mirrored into
// notes (adversarial catch — corpus-derived text riding in notes was both a
// flood re-entry and an injection path into attention's note filter). The
// report prints conditions in their own census; attention takes the
// statements it needs from the structured channel.

const COLLAPSE_AT = 3;

// Cause labels and the statement embed parser text, which echoes corpus
// content — bounded here so a hostile corpus cannot rebuild the flood
// inside one megabyte-long "collapsed" statement (adversarial catch).
const CAUSE_LABEL_MAX = 120;
const CAUSES_IN_STATEMENT = 5;

/**
 * @typedef {{ kind: string, count: number, of: number, statement: string,
 *   members: string[] }} Condition
 */

/**
 * Provenance mining saturation. Collapsing REPLACES the per-title notes:
 * the affected titles ride in `members`, so the detail is kept without
 * repeating one sentence hundreds of times.
 * @param {string[]} saturatedTitles @param {number} minedTitles
 * @param {number} bound @returns {Condition | null}
 */
function saturationCondition(saturatedTitles, minedTitles, bound) {
  if (saturatedTitles.length <= COLLAPSE_AT) return null;
  return {
    kind: 'provenance-saturation',
    count: saturatedTitles.length,
    of: minedTitles,
    statement:
      `${saturatedTitles.length} of ${minedTitles} mined scenario titles hit the `
      + `${bound}-result provenance mining bound — some discussing entries may be unlinked; `
      + 'the affected titles ride with this condition.',
    members: [...saturatedTitles].sort(compareCodePoints),
  };
}

/**
 * Mass quarantine, rolled up by cause. Additive: the per-file exceptions
 * stay individually named; this states the corpus-wide shape once. The
 * statement names at most CAUSES_IN_STATEMENT causes and counts the rest —
 * the full cause census rides in `members`.
 * @param {Array<{error: string}>} exceptions @param {number} totalFiles
 * @returns {Condition | null}
 */
function quarantineCondition(exceptions, totalFiles) {
  if (exceptions.length <= COLLAPSE_AT) return null;
  /** @type {Map<string, number>} */
  const causes = new Map();
  for (const e of exceptions) {
    const c = causeOf(e.error);
    causes.set(c, (causes.get(c) ?? 0) + 1);
  }
  const parts = [...causes.entries()]
    .sort((a, b) => b[1] - a[1] || compareCodePoints(a[0], b[0]))
    .map(([cause, n]) => `${n}× ${cause}`);
  const shown = parts.slice(0, CAUSES_IN_STATEMENT);
  const rest = parts.length - shown.length;
  return {
    kind: 'quarantine-rollup',
    count: exceptions.length,
    of: totalFiles,
    statement:
      `${exceptions.length} of ${totalFiles} feature files are quarantined — `
      + `causes: ${shown.join('; ')}${rest > 0 ? `; and ${rest} more cause class(es)` : ''}.`,
    members: parts,
  };
}

/**
 * A source tree with no design tier at all. One fact, ruled to replace the
 * per-scenario unrefined flood; attention suppresses that signal and names
 * this statement instead. Judged on the SOURCE TREE, not the parsed corpus:
 * a design tier that exists but is quarantined is a parse problem the
 * exceptions already name, never "no design tier" (adversarial catch — the
 * false statement would flip the whole attention posture on one transient
 * syntax error). An empty corpus states nothing — no ranking to lose.
 * @param {Array<{tier: string}>} corpus
 * @param {string[]} featureFiles every feature file found on disk
 * @returns {Condition | null}
 */
function tierAbsenceCondition(corpus, featureFiles) {
  if (corpus.length === 0) return null;
  if (featureFiles.some((f) => f.split('/').includes('design'))) return null;
  return {
    kind: 'design-tier-absent',
    count: corpus.length,
    of: corpus.length,
    statement: `no design tier — refinement ranking unavailable (${corpus.length} scenarios).`,
    members: [],
  };
}

/**
 * Cause class of a quarantine error: the parser's leading `path:line:`
 * prefix stripped (it made every file its own "cause"), quoted names
 * blanked (curly quotes normalized first), digits blanked, and the label
 * bounded — so files failing the same way count as one cause. Known
 * residue: a quoted name that itself contains a straight quote leaks a
 * fragment past the pairwise blanking and can split a cause class.
 * @param {string} error @returns {string}
 */
function causeOf(error) {
  const unprefixed = error.replace(/[“”«»]/g, '"').replace(/"[^"]*"/g, '"…"')
    .replace(/^.*?:\d+: /, '');
  return excerpt(unprefixed.replace(/\d+/g, 'N'), CAUSE_LABEL_MAX);
}

module.exports = { saturationCondition, quarantineCondition, tierAbsenceCondition };
