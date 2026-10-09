'use strict';
const { jkey } = require('./util');

// Refinement resolution — external-first, per the design ruling: directories,
// names, git threads. No tags unless field runs prove this lossy.
//
// Feature level: features/design/<name>/** and features/design/<name>.feature
// refine features/<name>.feature.
// Scenario level: within the mapped UAT feature, the parent is the UAT
// scenario with the best title-token overlap above a floor. A tie refuses to
// guess — a wrong link would fake intent coverage, the same spirit as the
// no-best-guess-identity fence; the scenario stays an orphan and the
// neighborhood view offers candidates instead.
//
// Resolution is identity-thread-aware: a scenario that moved or was retitled
// (confirmed by the identity machinery) resolves through its former
// locations and titles too — which is exactly how trace links survive
// renames without ever being declared.

const TITLE_FLOOR = 0.2;

/**
 * @typedef {{ designKey: string, uatKey: string, basis: string }} Refinement
 */

/**
 * @param {Array<{key: string, file: string, title: string, tier: string}>} corpus
 * @param {import('./history').History} history
 * @returns {Refinement[]}
 */
function resolveRefinements(corpus, history) {
  const uatByFile = new Map();
  for (const c of corpus) {
    if (c.tier !== 'uat') continue;
    const arr = uatByFile.get(c.file) ?? [];
    arr.push(c);
    uatByFile.set(c.file, arr);
  }

  /** @type {Refinement[]} */
  const out = [];
  for (const c of corpus) {
    if (c.tier !== 'design') continue;
    const tl = history.timelines.get(jkey(c.file, c.title));
    /** @type {Array<{file: string, title: string}>} */
    const identities = [{ file: c.file, title: c.title }];
    if (tl !== undefined) {
      for (const e of tl.events) {
        if (e.event === 'renamed' && e.from) identities.push(e.from);
      }
    }
    for (const id of identities) {
      const uatFile = mapDesignFileToUat(id.file);
      if (uatFile === null) continue;
      const candidates = uatByFile.get(uatFile);
      if (candidates === undefined) continue;
      const parent = bestParent(id.title, candidates);
      if (parent === null) continue;
      out.push({
        designKey: c.key,
        uatKey: parent.key,
        basis: id.file === c.file && id.title === c.title
          ? 'directory+title'
          : 'directory+title via former identity',
      });
      break;
    }
  }
  return out;
}

/**
 * features/design/<name>/** or features/design/<name>.feature →
 * features/<name>.feature. Paths are root-relative POSIX.
 * @param {string} designFile @returns {string | null}
 */
function mapDesignFileToUat(designFile) {
  const parts = designFile.split('/');
  const di = parts.indexOf('design');
  if (di === -1 || di + 1 >= parts.length) return null;
  const next = parts[di + 1];
  const name = next.endsWith('.feature') ? next.slice(0, -'.feature'.length) : next;
  return [...parts.slice(0, di), `${name}.feature`].join('/');
}

/**
 * Best UAT parent by title-token Dice overlap, floor applied, ties refused.
 * @param {string} title
 * @param {Array<{key: string, title: string}>} candidates
 * @returns {{key: string, title: string} | null}
 */
function bestParent(title, candidates) {
  const t = tokens(title);
  let best = null;
  let bestScore = 0;
  let tied = false;
  for (const c of candidates) {
    const ct = tokens(c.title);
    const shared = [...t].filter((x) => ct.has(x)).length;
    const score = t.size + ct.size === 0 ? 0 : (2 * shared) / (t.size + ct.size);
    if (score > bestScore) {
      best = c;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }
  if (best === null || bestScore < TITLE_FLOOR || tied) return null;
  return best;
}

/** @param {string} s @returns {Set<string>} */
function tokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0));
}

module.exports = { resolveRefinements, mapDesignFileToUat };
