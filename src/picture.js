'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Node's built-in SQLite (Node >= 24.16): no native build, the SQLite the
// running Node carries — the same driver treecontext reads its store with.
const { DatabaseSync } = require('node:sqlite');
const { canonJson, compareCodePoints } = require('./util');
const { readState, picturePath } = require('./state');
const { GtRefusal } = require('./errors');

/**
 * @typedef {{ kind: string, key: string, data: Record<string, unknown> }} PNode
 * @typedef {{ src: string, dst: string, cls: string, data?: Record<string, unknown> }} PEdge
 * @typedef {{ nodes: PNode[], edges: PEdge[], meta: Record<string, unknown> }} PictureModel
 */

const SCHEMA = `
CREATE TABLE node (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL
);
CREATE TABLE edge (
  id INTEGER PRIMARY KEY,
  src INTEGER NOT NULL REFERENCES node(id),
  dst INTEGER NOT NULL REFERENCES node(id),
  class TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * Build picture.db from a fully-assembled model, deterministically: rows
 * sort by code point, JSON is canonical, and the file is built fresh in a
 * temp path then atomically renamed — so unchanged sources rebuild the same
 * bytes, and a query never sees half a refresh. The refresh time lives in
 * refresh.json, never here: picture bytes are a function of sources alone.
 * @param {string} pictureDir @param {PictureModel} model
 */
function buildPicture(pictureDir, model) {
  fs.mkdirSync(pictureDir, { recursive: true });
  const tmp = path.join(pictureDir, `picture.db.building.${process.pid}`);
  fs.rmSync(tmp, { force: true });

  const nodes = [...model.nodes].sort((a, b) => compareCodePoints(a.key, b.key));
  const edges = [...model.edges].sort((a, b) =>
    compareCodePoints(a.cls, b.cls) || compareCodePoints(a.src, b.src) || compareCodePoints(a.dst, b.dst));

  const db = new DatabaseSync(tmp);
  let built = false;
  try {
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec(SCHEMA);
    const insNode = db.prepare('INSERT INTO node (kind, key, data) VALUES (?, ?, ?)');
    const insEdge = db.prepare('INSERT INTO edge (src, dst, class, data) VALUES (?, ?, ?, ?)');
    const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    /** @type {Map<string, number | bigint>} */
    const ids = new Map();
    // One transaction for the whole build: node:sqlite has no transaction
    // wrapper, so the bracket is explicit. Foreign keys are on by default
    // under node:sqlite; edges insert after the nodes they reference.
    db.exec('BEGIN');
    try {
      for (const n of nodes) {
        const r = insNode.run(n.kind, n.key, canonJson(n.data));
        ids.set(n.key, r.lastInsertRowid);
      }
      for (const e of edges) {
        const src = ids.get(e.src);
        const dst = ids.get(e.dst);
        if (src === undefined || dst === undefined) {
          throw new Error(`edge ${e.cls} references unknown node ${src === undefined ? e.src : e.dst}`);
        }
        insEdge.run(src, dst, e.cls, canonJson(e.data ?? {}));
      }
      for (const key of Object.keys(model.meta).sort(compareCodePoints)) {
        insMeta.run(key, canonJson(model.meta[key]));
      }
      db.exec('COMMIT');
    } catch (e) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw e;
    }
    built = true;
  } finally {
    db.close();
    if (!built) fs.rmSync(tmp, { force: true });
  }
  fs.renameSync(tmp, picturePath(pictureDir));
  fsyncDir(pictureDir);
}

/**
 * Persist the directory entry after a rename — without this a power failure
 * can keep old refresh.json over a name that no longer resolves.
 * @param {string} dir
 */
function fsyncDir(dir) {
  try {
    const fd = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // best-effort: some platforms refuse directory fsync
  }
}

/**
 * Open the picture for a query, or refuse with directions. Refusal wording
 * is contract: it always says what restores answers, never serves silence.
 * @param {string} pictureDir
 * @returns {{ db: import('node:sqlite').DatabaseSync, refresh: Record<string, unknown> }}
 */
function openForQuery(pictureDir) {
  let state = readState(pictureDir);
  if (state.phase === 'never') {
    throw new GtRefusal('no picture exists yet — a refresh builds one; run a refresh first.');
  }
  if (state.phase === 'broken') {
    throw new GtRefusal(
      `the last refresh failed (${state.broken?.error}); a successful refresh restores answers.`);
  }
  if (state.phase === 'refreshing' && !state.refresh) {
    throw new GtRefusal('no picture exists yet — the first refresh is still running; a completed refresh builds one.');
  }
  // Generation cross-check: picture.db and refresh.json are two files, and a
  // concurrent refresh can swap the db between our metadata read and our
  // open. A mismatch means the answer would stitch one generation's bytes to
  // another's provenance — retry once (the swap has settled), then refuse.
  for (let attempt = 0; ; attempt++) {
    const refresh = /** @type {Record<string, unknown>} */ (state.refresh);
    // Read-only implies must-exist: a missing picture.db throws SQLITE_CANTOPEN
    // rather than creating an empty file under a query.
    const db = new DatabaseSync(picturePath(pictureDir), { readOnly: true });
    const row = /** @type {{value: string} | undefined} */ (
      db.prepare("SELECT value FROM meta WHERE key = 'generation'").get());
    const generation = row === undefined ? undefined : JSON.parse(row.value);
    if (generation === refresh.generation) return { db, refresh };
    db.close();
    if (attempt >= 1) {
      throw new GtRefusal(
        'a refresh is replacing the picture right now — retry the query once it settles.');
    }
    const again = readState(pictureDir);
    if (again.phase !== 'ok' && again.phase !== 'refreshing') {
      throw new GtRefusal('the picture changed mid-query — a refresh is in progress; retry once it settles.');
    }
    state = again;
  }
}

/**
 * A canonical logical dump of the picture — nodes, edges, meta, in stored
 * order. This is what "the same picture" means content-wise; tests and the
 * report both read through it.
 * @param {string} pictureDir
 * @returns {{ refresh: Record<string, unknown>, nodes: Array<Record<string, unknown>>, edges: Array<Record<string, unknown>>, meta: Record<string, unknown> }}
 */
function dumpPicture(pictureDir) {
  const { db, refresh } = openForQuery(pictureDir);
  try {
    const nodes = /** @type {Array<{id: number, kind: string, key: string, data: string}>} */ (
      db.prepare('SELECT id, kind, key, data FROM node ORDER BY id').all())
      .map((r) => ({ id: r.id, kind: r.kind, key: r.key, data: JSON.parse(r.data) }));
    const edges = /** @type {Array<{id: number, src: number, dst: number, class: string, data: string}>} */ (
      db.prepare('SELECT id, src, dst, class, data FROM edge ORDER BY id').all())
      .map((r) => ({ id: r.id, src: r.src, dst: r.dst, class: r.class, data: JSON.parse(r.data) }));
    /** @type {Record<string, unknown>} */
    const meta = {};
    for (const r of /** @type {Array<{key: string, value: string}>} */ (
      db.prepare('SELECT key, value FROM meta ORDER BY key').all())) {
      meta[r.key] = JSON.parse(r.value);
    }
    return { refresh, nodes, edges, meta };
  } finally {
    db.close();
  }
}

module.exports = { buildPicture, openForQuery, dumpPicture };
