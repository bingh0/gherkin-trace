'use strict';
const { resolveSources } = require('./sources');
const { dumpPicture } = require('./picture');
const { queryAttention } = require('./attention');
const { compareCodePoints, canonJson } = require('./util');

// The static refresh report — one generated, human-readable artifact per
// refresh, diffable and committable so drift shows in git history.
//
// Byte discipline: the report's BYTES are a pure function of picture.db,
// refresh.json, and the tool version — no wall clock, and the live
// freshness probe queryAttention performs on the side never reaches the
// output. The refresh time appears in EXACTLY one line — so a refresh over
// byte-identical sources changes the report in exactly that line, and
// re-emitting without a refresh changes nothing at all.

/**
 * @param {import('./sources').GtOptions} [opts]
 * @returns {string} the report, markdown
 */
function emitReport(opts = {}) {
  const src = resolveSources(opts);
  const d = dumpPicture(src.pictureDir);
  const attention = queryAttention(opts);
  const version = /** @type {{version: string}} */ (require('../package.json')).version;

  /** @type {string[]} */
  const out = [];
  out.push('# gherkin-trace report', '');

  // --- attention first: the report opens with what matters -----------------
  out.push('## Attention', '');
  if (attention.items.length === 0) {
    out.push('Nothing needs attention — and this list is never padded.');
  } else {
    for (const item of attention.items) {
      out.push(`${item.rank + 1}. [${item.tier}] ${itemLabel(item)}`);
      out.push(`   evidence: ${canonJson(item.evidence)}`);
      for (const s of item.absorbed) {
        out.push(`   - also ${s.signal}: ${canonJson(s.evidence)}`);
      }
    }
  }
  const absorbedTiers = attention.tiers.filter((t) => t.absorbed > 0);
  for (const t of absorbedTiers) {
    out.push(`(${t.tier}: ${t.absorbed} item(s) absorbed into higher tiers)`);
  }
  for (const l of attention.limitations) {
    out.push(`limitation: ${l}`);
  }
  out.push('');

  // --- review and coverage --------------------------------------------------
  const scenarios = d.nodes.filter((n) => n.kind === 'scenario')
    .map((n) => /** @type {{file: string, title: string, tier: string,
      review?: {status: string | null}}} */ (n.data));
  const byName = (/** @type {{file: string, title: string}} */ a, /** @type {{file: string, title: string}} */ b) =>
    compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title);
  const reviewed = scenarios.filter((s) => s.review?.status === 'reviewed').sort(byName);
  const lapsed = scenarios.filter((s) => s.review?.status === 'reviewed-then-changed').sort(byName);

  out.push('## Review and coverage', '');
  out.push(`Reviewed set: ${reviewed.length} scenario(s)`);
  for (const s of reviewed) out.push(`- "${s.title}" (${s.file})`);
  out.push(`Reviewed-then-changed: ${lapsed.length}`);
  for (const s of lapsed) out.push(`- "${s.title}" (${s.file})`);

  const orphanItems = attention.items.filter((i) => i.tier === 'orphan');
  const orphanSignals = attention.items
    .filter((i) => i.absorbed.some((a) => a.signal === 'orphan'));
  out.push(`Orphans: ${orphanItems.length + orphanSignals.length}`);
  for (const i of [...orphanItems, ...orphanSignals]) {
    out.push(`- "${i.title}" (${i.file})`);
  }

  const contested = d.nodes.filter((n) => n.kind === 'region')
    .map((n) => /** @type {import('./heat').Region} */ (n.data))
    .filter((r) => r.state === 'contested');
  out.push(`Contested regions: ${contested.length}`);
  for (const r of contested) {
    out.push(`- region ${r.sessionId}: ${r.entryCount} entries; terms: ${r.terms.join(', ')}`);
  }

  const closed = /** @type {Array<{file: string, title: string, reason: string, reviewedAtClosure: boolean | null}>} */ (
    d.meta.closedThreads ?? []);
  out.push(`Closed threads: ${closed.length}`);
  for (const c of closed) {
    // null is "cannot tell", never rendered as silence
    const reviewNote = c.reviewedAtClosure === true ? ' — reviewed intent removed'
      : c.reviewedAtClosure === null ? ' — review status dark at closure' : '';
    out.push(`- "${c.title}" (${c.file}): ${c.reason}${reviewNote}`);
  }
  out.push('');

  // --- heat ------------------------------------------------------------------
  out.push('## Heat', '');
  const regions = d.nodes.filter((n) => n.kind === 'region')
    .map((n) => /** @type {import('./heat').Region} */ (n.data));
  if (d.meta.heatWithheld === true) {
    out.push('heat classification withheld — no natural break in discussion density.');
  } else if (regions.length === 0) {
    const dark = /** @type {string[]} */ (d.meta.dark ?? []);
    out.push(dark.includes('heat') ? 'heat is dark — no journal to mine.' : 'no discussion regions formed.');
  }
  for (const r of regions) {
    const suppressed = r.suppressedBy === undefined ? ''
      : ` (suppressed by the fence on "${r.suppressedBy.topic}", out-of-scope line ${r.suppressedBy.line})`;
    out.push(`- region ${r.sessionId}: ${r.state}${r.flag ? ` [${r.flag}]` : ''} — ${r.entryCount} entries${suppressed}`);
  }
  out.push('');

  // --- inputs ---------------------------------------------------------------
  const sources = /** @type {{featureFiles: string[], manifest: string | null,
    journal: string | null, fence: string | null}} */ (d.meta.sources);
  out.push('## Inputs', '');
  out.push(`Refresh time: ${d.refresh.refreshedAt}`);
  out.push(`Sources read:`);
  out.push(`- feature files (${sources.featureFiles.length}):`);
  for (const f of sources.featureFiles) out.push(`  - ${f}`);
  out.push(`- run manifest: ${sources.manifest ?? 'absent'}`);
  out.push(`- journal: ${sources.journal ?? 'absent'}`);
  out.push(`- out-of-scope list: ${sources.fence ?? 'absent'}`);
  const dark = /** @type {string[]} */ (d.meta.dark ?? []);
  out.push(`Dark: ${dark.length > 0 ? dark.join(', ') : 'none'}`);
  const conditions = /** @type {Array<{statement: string}>} */ (d.meta.conditions ?? []);
  out.push(`Conditions: ${conditions.length}`);
  for (const c of conditions) out.push(`- ${c.statement}`);
  const notes = /** @type {string[]} */ (d.meta.notes ?? []);
  out.push(`Notes: ${notes.length}`);
  for (const n of notes) out.push(`- ${n}`);
  const exceptions = /** @type {Array<{file: string, error: string, statement: string}>} */ (
    d.meta.exceptions ?? []);
  out.push(`Exceptions: ${exceptions.length}`);
  for (const e of exceptions) out.push(`- ${e.file}: ${e.error}`);
  out.push(`Tool: gherkin-trace v${version}`);
  out.push('');

  return out.join('\n');
}

/** @param {import('./attention').AttentionItem} item @returns {string} */
function itemLabel(item) {
  if (item.kind === 'fence') return `fence "${item.topic}" under pressure`;
  if (item.kind === 'region') return `region ${item.sessionId}`;
  return `"${item.title}" (${item.file})`;
}

module.exports = { emitReport };
