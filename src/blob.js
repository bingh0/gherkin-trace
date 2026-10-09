'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { canonJson } = require('./util');

// The sidecar blob — gt's half of the pane-blob seam (ccr's
// docs/PANE-CONTRACT.md, v1). A refresh drops this beside refresh.json so a
// schema-blind renderer can show trace health without asking gt anything.
//
// Discipline mirrors the picture's: every row derives from the same picture
// the report is emitted from; values are functions of the picture, never
// the clock; a failed refresh REWRITES the blob to a broken payload (a file
// cannot refuse, so it must confess); refusals touch nothing; before the
// first refresh no blob exists at all. Display strings are stripped of
// control bytes at the source — the consumer strips again, and stripping
// twice is the point.

const BLOB = 'sidecar.json';

/** Strip C0/C1 control bytes and DEL from a display string. @param {string} s */
function inert(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}

/**
 * @param {{
 *   refreshedAt: string,
 *   dark: string[],
 *   counts: { features: number, scenarios: number },
 *   exceptions: Array<{file: string}>,
 *   heatWithheld: boolean,
 *   reviewedCount: number,
 *   attention: { total: number, topTier: string | null },
 *   breachCount: number, possibleBreachCount: number,
 *   hotRegions: number, hottestRegions: number,
 *   refinementDark: boolean,
 * }} p
 * @returns {Record<string, unknown>} a v1 pane blob
 */
function healthyBlob(p) {
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];

  // attention: alert when the top tier is a breach family, warn when
  // anything at all wants eyes, ok when truly empty. With the unrefined
  // tier suppressed corpus-wide (no design tier), an empty list is not an
  // all-clear — the row darkens and says why (never silently green).
  const breachy = p.attention.topTier === 'breach'
    || p.attention.topTier === 'sanction-violation'
    || p.attention.topTier === 'possible-breach';
  const refinementNote = 'refinement ranking dark — no design tier';
  rows.push(row('attention', String(p.attention.total),
    p.attention.total === 0 ? (p.refinementDark ? 'dark' : 'ok') : breachy ? 'alert' : 'warn',
    p.attention.topTier === null
      ? (p.refinementDark ? refinementNote : undefined)
      : `top: ${p.attention.topTier}${p.refinementDark ? `; ${refinementNote}` : ''}`));

  rows.push(p.dark.includes('review status')
    ? row('reviewed', 'dark', 'dark', 'review status is dark')
    : row('reviewed', String(p.reviewedCount), 'ok'));

  rows.push(p.dark.includes('heat')
    ? row('heat', 'dark', 'dark', 'no journal mined')
    : p.heatWithheld
      ? row('heat', 'withheld', 'dark', 'no natural break — classification withheld')
      : row('heat', `${p.hottestRegions} hottest, ${p.hotRegions} hot`,
        p.hottestRegions > 0 ? 'alert' : p.hotRegions > 0 ? 'warn' : 'ok'));

  rows.push(p.dark.includes('binding signals')
    ? row('binding', 'dark', 'dark', 'no run manifest')
    : row('binding', `${p.counts.scenarios} joined`, 'ok'));

  rows.push(p.dark.includes('fence signals')
    ? row('fence', 'dark', 'dark', 'no out-of-scope list')
    : p.breachCount > 0
      ? row('fence', `${p.breachCount} breach(es)`, 'alert')
      : p.possibleBreachCount > 0
        ? row('fence', `${p.possibleBreachCount} possible`, 'warn')
        : row('fence', 'clean', 'ok'));

  rows.push(row('exceptions', String(p.exceptions.length),
    p.exceptions.length > 0 ? 'warn' : 'ok',
    p.exceptions.length > 0 ? 'files excepted from the picture' : undefined));

  return {
    v: 1,
    tool: 'gherkin-trace',
    title: 'trace',
    status: 'ok',
    basis: { label: 'refresh', at: p.refreshedAt },
    message: null,
    rows,
  };
}

/**
 * @param {string} label @param {string} value @param {string} status
 * @param {string} [detail]
 */
function row(label, value, status, detail) {
  /** @type {Record<string, unknown>} */
  const r = { label: inert(label), value: inert(value), status };
  if (detail !== undefined) r.detail = inert(detail);
  return r;
}

/** @param {string} failedAt @param {string} message */
function brokenBlob(failedAt, message) {
  return {
    v: 1,
    tool: 'gherkin-trace',
    title: 'trace',
    status: 'broken',
    basis: { label: 'refresh', at: failedAt },
    message: inert(message),
    rows: [],
  };
}

/**
 * Atomic write-aside + rename, temp file in the same (owner-only) directory.
 * @param {string} pictureDir @param {Record<string, unknown>} blob
 */
function writeBlob(pictureDir, blob) {
  const target = path.join(pictureDir, BLOB);
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, canonJson(blob) + '\n');
  fs.renameSync(tmp, target);
}

module.exports = { healthyBlob, brokenBlob, writeBlob, BLOB };
