'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { resolveSources } = require('./sources');
const { openForQuery } = require('./picture');
const { compareCodePoints, sha256, canonJson } = require('./util');

// Trace lookups — the correlation questions only the join can answer.
// Every answer carries freshness: the refresh time it stands on and whether
// any source changed since (the staleness the projection model makes
// visible instead of hiding). Ruled slot semantics (2026-07-30): the
// neighborhood is a fixed four-slot view; an empty slot states its
// emptiness in its own vocabulary — mined results, never guarantees.

/** @typedef {import('./sources').GtOptions} GtOptions */

/**
 * @typedef {{
 *   id: number,
 *   file: string, title: string, tier: string,
 *   bindingStatus: string | null,
 *   review?: { status: string | null },
 *   formerTitles?: Array<{file: string, title: string}>,
 *   rulingCandidates?: unknown,
 * }} ScenarioRow
 */

/**
 * Load the picture into in-memory maps for one query.
 * @param {GtOptions} opts
 */
function load(opts) {
  const src = resolveSources(opts);
  const { db, refresh } = openForQuery(src.pictureDir);
  try {
    const nodes = /** @type {Array<{id: number, kind: string, key: string, data: string}>} */ (
      db.prepare('SELECT id, kind, key, data FROM node ORDER BY id').all())
      .map((r) => ({ id: r.id, kind: r.kind, key: r.key, data: JSON.parse(r.data) }));
    const edges = /** @type {Array<{src: number, dst: number, class: string, data: string}>} */ (
      db.prepare('SELECT src, dst, class, data FROM edge ORDER BY id').all())
      .map((r) => ({ src: r.src, dst: r.dst, class: r.class, data: JSON.parse(r.data) }));
    /** @type {Record<string, unknown>} */
    const meta = {};
    for (const r of /** @type {Array<{key: string, value: string}>} */ (
      db.prepare('SELECT key, value FROM meta').all())) {
      meta[r.key] = JSON.parse(r.value);
    }
    return {
      src,
      refreshedAt: String(refresh.refreshedAt),
      nodes,
      edges,
      meta,
      sourcesChanged: sourcesChangedSince(src, /** @type {Record<string, unknown>} */ (meta.sourceHashes)),
    };
  } finally {
    db.close();
  }
}

/**
 * Recompute source hashes and compare with the ones the picture was built
 * from — "whether any source changed since that time", answered honestly.
 * @param {import('./sources').ResolvedSources} src
 * @param {Record<string, unknown>} stored
 * @returns {boolean}
 */
function sourcesChangedSince(src, stored) {
  /** @type {Record<string, string>} */
  const featureHashes = {};
  for (const rel of src.featureFiles) {
    try {
      featureHashes[rel] = sha256(fs.readFileSync(path.join(src.root, rel)));
    } catch {
      return true;
    }
  }
  /** @type {(p: string | null) => string | null} */
  const fileHash = (p) => {
    if (p === null) return null;
    try {
      return sha256(fs.readFileSync(p));
    } catch (e) {
      // absent is null; unreadable-but-present must never compare equal to
      // a stored null — that would be an all-clear from a failed read
      return /** @type {NodeJS.ErrnoException} */ (e).code === 'ENOENT'
        ? null : 'unreadable';
    }
  };
  /** @type {string | null} */
  let journalHash = null;
  if (src.journal !== null) {
    try {
      const wal = fs.existsSync(src.journal + '-wal')
        ? fs.readFileSync(src.journal + '-wal') : Buffer.alloc(0);
      journalHash = sha256(Buffer.concat([fs.readFileSync(src.journal), wal]));
    } catch {
      return true;
    }
  }
  const current = {
    features: featureHashes,
    manifest: fileHash(src.manifest),
    journal: journalHash,
    fence: fileHash(src.fence),
  };
  return canonJson(current) !== canonJson(stored);
}

/** @param {ReturnType<typeof load>} p @returns {ScenarioRow[]} */
function scenarios(p) {
  return p.nodes.filter((n) => n.kind === 'scenario')
    .map((n) => ({ id: n.id, .../** @type {Omit<ScenarioRow, 'id'>} */ (n.data) }));
}

/**
 * @param {ReturnType<typeof load>} p @param {string} title
 * @returns {{ found: ScenarioRow } | { miss: ReturnType<typeof missAnswer> }}
 */
function byTitle(p, title) {
  const all = scenarios(p);
  const hits = all.filter((s) => s.title === title);
  if (hits.length > 0) return { found: hits[0] };
  return { miss: missAnswer(p, title, all) };
}

/**
 * A lookup miss: not-in-picture as of the refresh, with the closest titles
 * the picture DOES hold — a typo and a rename-since-refresh both get caught
 * by the reader seeing what is there.
 * @param {ReturnType<typeof load>} p @param {string} title @param {ScenarioRow[]} all
 */
function missAnswer(p, title, all) {
  const t = tokens(title);
  const near = all
    .map((s) => {
      const st = tokens(s.title);
      const shared = [...t].filter((x) => st.has(x)).length;
      return { s, score: t.size + st.size === 0 ? 0 : (2 * shared) / (t.size + st.size) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score
      || compareCodePoints(a.s.file, b.s.file) || compareCodePoints(a.s.title, b.s.title))
    .slice(0, 3)
    .map((x) => ({ file: x.s.file, title: x.s.title }));
  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    miss: true,
    statement: `"${title}" is not in the picture as of ${p.refreshedAt}.`,
    nearMatches: near,
  };
}

/** @param {string} s @returns {Set<string>} */
function tokens(s) {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0));
}

/**
 * The exception view: orphan design scenarios (mechanics nobody asked for)
 * and unrefined UAT scenarios (intent nobody refined). Intact links are not
 * listed — exceptions only.
 * @param {GtOptions} [opts]
 */
function queryExceptions(opts = {}) {
  const p = load(opts);
  const all = scenarios(p);
  const refinedFrom = new Set(p.edges.filter((e) => e.class === 'refinement').map((e) => e.src));
  const refinedTo = new Set(p.edges.filter((e) => e.class === 'refinement').map((e) => e.dst));
  const sort = (/** @type {Array<{file: string, title: string}>} */ xs) =>
    xs.sort((a, b) => compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title));
  // What this answer cannot see, named: excepted files' scenarios are
  // absent from the lists, and a zero-orphan answer over a corpus with no
  // design tier is a census fact, not a traced-clean verdict.
  const exceptions = /** @type {Array<{statement: string}>} */ (p.meta.exceptions ?? []);
  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    census: {
      design: all.filter((s) => s.tier === 'design').length,
      uat: all.filter((s) => s.tier === 'uat').length,
    },
    limitations: exceptions.map((e) => e.statement),
    orphans: sort(all.filter((s) => s.tier === 'design' && !refinedFrom.has(s.id))
      .map((s) => ({ file: s.file, title: s.title }))),
    unrefined: sort(all.filter((s) => s.tier === 'uat' && !refinedTo.has(s.id))
      .map((s) => ({ file: s.file, title: s.title }))),
  };
}

/**
 * Downward: what refines this UAT scenario, with binding status. Asked of a
 * design scenario, it reorients instead — the answer teaches where the node
 * sits and hands over the useful direction.
 * @param {GtOptions} opts @param {string} title
 */
function queryDown(opts, title) {
  const p = load(opts);
  const r = byTitle(p, title);
  if ('miss' in r) return r.miss;
  const s = r.found;
  if (s.tier === 'design') {
    return {
      refreshedAt: p.refreshedAt,
      sourcesChanged: p.sourcesChanged,
      tier: 'design',
      offer: 'upward',
      statement: `"${title}" sits at the design tier — nothing refines a design scenario; `
        + 'the upward lookup traces it to its intent.',
    };
  }
  const refs = p.edges.filter((e) => e.class === 'refinement' && e.dst === s.id)
    .map((e) => scenarios(p).find((x) => x.id === e.src))
    .filter((x) => x !== undefined)
    .map((x) => ({ file: x.file, title: x.title, bindingStatus: x.bindingStatus }))
    .sort((a, b) => compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title));
  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    tier: 'uat',
    refinements: refs,
  };
}

/**
 * Upward: the declared intent behind a design scenario, with review status.
 * Asked of a UAT scenario, it reorients.
 * @param {GtOptions} opts @param {string} title
 */
function queryUp(opts, title) {
  const p = load(opts);
  const r = byTitle(p, title);
  if ('miss' in r) return r.miss;
  const s = r.found;
  if (s.tier === 'uat') {
    return {
      refreshedAt: p.refreshedAt,
      sourcesChanged: p.sourcesChanged,
      tier: 'uat',
      offer: 'downward',
      statement: `"${title}" sits at the UAT tier — nothing is above declared intent; `
        + 'the downward lookup lists its refinements.',
    };
  }
  const parents = p.edges.filter((e) => e.class === 'refinement' && e.src === s.id)
    .map((e) => scenarios(p).find((x) => x.id === e.dst))
    .filter((x) => x !== undefined)
    .map((x) => ({ file: x.file, title: x.title, review: x.review?.status ?? null }));
  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    tier: 'design',
    intent: parents.length > 0 ? parents[0] : null,
  };
}

/**
 * The neighborhood: a fixed four-slot view around a scenario — parent,
 * siblings, journal discussion, adjacent fence rulings — every slot
 * rendered, absences named in their own semantics.
 * @param {GtOptions} opts @param {string} title
 */
function queryNeighborhood(opts, title) {
  const p = load(opts);
  const r = byTitle(p, title);
  if ('miss' in r) return r.miss;
  const s = r.found;
  const all = scenarios(p);

  // parent slot
  const parentIds = p.edges.filter((e) => e.class === 'refinement' && e.src === s.id)
    .map((e) => e.dst);
  const parent = all.find((x) => parentIds.includes(x.id));
  /** @type {Record<string, unknown>} */
  const parentSlot = parent !== undefined
    ? { file: parent.file, title: parent.title, review: parent.review?.status ?? null }
    : { absent: 'orphan — no intent is traced', candidates: candidateParents(p, s, all) };

  // siblings slot: other refinements of the same parent
  /** @type {Record<string, unknown>} */
  let siblingSlot;
  if (parent === undefined) {
    siblingSlot = { absent: 'no siblings — no intent is traced' };
  } else {
    const sibs = p.edges
      .filter((e) => e.class === 'refinement' && e.dst === parent.id && e.src !== s.id)
      .map((e) => all.find((x) => x.id === e.src))
      .filter((x) => x !== undefined)
      .map((x) => ({ file: x.file, title: x.title, bindingStatus: x.bindingStatus }))
      .sort((a, b) => compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title));
    siblingSlot = sibs.length > 0
      ? { siblings: sibs }
      : { absent: `"${title}" is the sole refinement of its intent` };
  }

  // journal slot: linked discussion; an empty slot names its emptiness in
  // its own semantics — and a DARK source is named as dark, never as a
  // mined "unexamined" (an absence computed is not an absence found).
  const dark = /** @type {string[]} */ (p.meta.dark ?? []);
  const entryIds = p.edges.filter((e) => e.class === 'provenance' && e.src === s.id)
    .map((e) => e.dst);
  const entries = p.nodes.filter((n) => n.kind === 'journal_entry' && entryIds.includes(n.id))
    .map((n) => /** @type {{tcNodeId: string, excerpt: string, createdAt: number}} */ (n.data))
    .sort((a, b) => a.createdAt - b.createdAt || compareCodePoints(a.tcNodeId, b.tcNodeId));
  const journalSlot = entries.length > 0
    ? { discussion: entries }
    : dark.includes('provenance')
      ? { absent: 'journal dark — no journal source was mined; discussion cannot be seen' }
      : { absent: 'unexamined — no journal discussion is linked to this scenario' };

  // fence slot: mined adjacency via fence edges
  const fenceEdges = p.edges.filter((e) => e.class === 'fence' && e.src === s.id);
  const fenceRulings = fenceEdges
    .map((e) => {
      const node = p.nodes.find((n) => n.id === e.dst);
      return node === undefined ? null : {
        topic: /** @type {{topic: string}} */ (node.data).topic,
        kind: /** @type {{kind: string}} */ (e.data).kind,
      };
    })
    .filter((x) => x !== null);
  const fenceSlot = fenceRulings.length > 0
    ? { rulings: fenceRulings }
    : dark.includes('fence signals')
      ? { absent: 'fence signals dark — no out-of-scope list was read' }
      : { absent: `no adjacent ruling was found as of ${p.refreshedAt}` };

  return {
    refreshedAt: p.refreshedAt,
    sourcesChanged: p.sourcesChanged,
    tier: s.tier,
    history: { formerTitles: s.formerTitles ?? [] },
    parent: parentSlot,
    siblings: siblingSlot,
    journal: journalSlot,
    fence: fenceSlot,
  };
}

/**
 * Candidate parents for an orphan: UAT scenarios co-mentioned in the
 * orphan's own journal discussion — each candidate citing the entry that
 * names both. Evidence offered, never adopted.
 * @param {ReturnType<typeof load>} p @param {ScenarioRow} s @param {ScenarioRow[]} all
 */
function candidateParents(p, s, all) {
  const entryIds = p.edges.filter((e) => e.class === 'provenance' && e.src === s.id)
    .map((e) => e.dst);
  const entries = p.nodes.filter((n) => n.kind === 'journal_entry' && entryIds.includes(n.id));
  /** @type {Array<{file: string, title: string, evidence: {tcNodeId: string, excerpt: string}}>} */
  const out = [];
  for (const u of all) {
    if (u.tier !== 'uat') continue;
    for (const e of entries) {
      const data = /** @type {{tcNodeId: string, excerpt: string}} */ (e.data);
      if (data.excerpt.toLowerCase().includes(u.title.toLowerCase())) {
        out.push({ file: u.file, title: u.title, evidence: { tcNodeId: data.tcNodeId, excerpt: data.excerpt } });
        break;
      }
    }
  }
  return out.sort((a, b) => compareCodePoints(a.file, b.file) || compareCodePoints(a.title, b.title));
}

module.exports = { queryExceptions, queryDown, queryUp, queryNeighborhood, load };
