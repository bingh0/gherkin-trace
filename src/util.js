'use strict';
const crypto = require('node:crypto');

/**
 * Compare strings by Unicode code point — the same ordering gnt's manifest
 * pins, so every sorted surface in the picture agrees with the manifest's.
 * @param {string} a @param {string} b @returns {number}
 */
function compareCodePoints(a, b) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = /** @type {number} */ (a.codePointAt(i));
    const cb = /** @type {number} */ (b.codePointAt(j));
    if (ca !== cb) return ca - cb;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  return (a.length - i) - (b.length - j);
}

/**
 * JSON with recursively sorted object keys — one serialization per value, so
 * stored rows (and therefore picture bytes) never depend on construction
 * order.
 * @param {unknown} value @returns {string}
 */
function canonJson(value) {
  return JSON.stringify(sortKeys(value));
}

/** @param {unknown} v @returns {unknown} */
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const k of Object.keys(v).sort()) {
      out[k] = sortKeys(/** @type {Record<string, unknown>} */ (v)[k]);
    }
    return out;
  }
  return v;
}

/** @param {Buffer | string} data @returns {string} */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Unambiguous scenario join key. A plain `${file}#${title}` collides when a
 * path or title itself contains `#` (legal Gherkin); a JSON array cannot.
 * @param {string} file @param {string} title @returns {string}
 */
function jkey(file, title) {
  return JSON.stringify([file, title]);
}

/**
 * Slice on code-point boundaries — never bisect a surrogate pair.
 * @param {string} s @param {number} n @returns {string}
 */
function excerpt(s, n) {
  const cps = [...s];
  return cps.length <= n ? s : cps.slice(0, n).join('');
}

/**
 * Format a moment as the picture's refresh-time string: UTC, minute
 * resolution — fine enough to date a refresh, coarse enough to stay honest.
 * @param {Date} d @returns {string}
 */
function formatTime(d) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} `
    + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}


/**
 * Harness-notification markup captured in the user turn is not
 * human-authored evidence (ruled 2026-08-21): it stays in the picture as
 * journal mass — heat and density still count it — but it never speaks
 * as the owner: not for fence pressure, not as a review ruling, not as a
 * healing ruling.
 * @param {{ role: string | null, content: string }} e @returns {boolean}
 */
function humanAuthored(e) {
  return e.role === 'user' && !e.content.trimStart().startsWith('<task-notification>');
}

module.exports = { compareCodePoints, canonJson, sha256, formatTime, jkey, excerpt, humanAuthored };
