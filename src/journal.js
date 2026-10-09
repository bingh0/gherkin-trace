'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** The error code openJournal throws when no treecontext name resolves. */
const TREECONTEXT_MISSING = 'GT_TREECONTEXT_MISSING';

/** The names tried, in order: the npm name, then the package/sibling name. */
let treecontextNames = ['treecontext-mcp', 'treecontext'];

/**
 * Test seam: point the loader at other names (the suite runs with
 * treecontext installed, so "not installed" has to be staged). Returns the
 * previous list so the caller can restore it.
 * @param {string[]} names @returns {string[]}
 */
function setTreecontextNames(names) {
  const previous = treecontextNames;
  treecontextNames = names;
  return previous;
}

/**
 * Import treecontext under the first installed name. When none resolves,
 * throw an error carrying TREECONTEXT_MISSING and the install teaching —
 * the caller treats it as an absent source, not a broken picture (ruled
 * 2026-10-08). Any other error still throws as itself.
 */
async function loadTreecontext() {
  let lastError;
  for (const name of treecontextNames) {
    try {
      const [{ wrapBetterSqlite }, { FlatStore }] = await Promise.all([import(`${name}/persistence/node`), import(name)]);
      return { wrapBetterSqlite, FlatStore };
    } catch (e) {
      const code = /** @type {NodeJS.ErrnoException} */ (e).code;
      if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND' && code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw e;
      lastError = e;
    }
  }
  const missing = /** @type {Error & {code?: string}} */ (new Error(
    `treecontext is not installed in this project (looked for ${treecontextNames.join(', then ')}) — `
    + 'journal mining is dark; install it beside gherkin-trace: npm install --save-dev treecontext-mcp',
    { cause: lastError }));
  missing.code = TREECONTEXT_MISSING;
  throw missing;
}

/**
 * Read-only adapter over a treecontext journal store, consumed through
 * treecontext's library query surface — never its SQLite schema.
 *
 * The store is never opened in place: a WAL-mode SQLite database grows
 * `-wal`/`-shm` sidecars beside it even under a read-only connection, and
 * the contract is byte-for-byte unchanged sources. So the refresh
 * snapshot-copies the store (db plus any sidecars) into a temp directory
 * and queries the copy; the original is only ever read as bytes. The
 * source hash is computed from the SNAPSHOT bytes — the hash attests to
 * exactly what the picture was built from, even if a live writer commits
 * between copy and query.
 *
 * treecontext ships ESM; gt is CommonJS. The dynamic import is the seam,
 * kept in this one file.
 *
 * @typedef {import('treecontext').QueryResult} JournalHit
 * @typedef {{
 *   query: (text: string, opts?: import('treecontext').QueryOptions) => Promise<JournalHit[]>,
 *   close: () => void,
 *   hash: string,
 *   totalNodes: number,
 * }} Journal
 */

/**
 * @param {string} dbPath @param {string} namespace
 * @returns {Promise<Journal>}
 */
async function openJournal(dbPath, namespace) {
  const snapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-journal-'));
  const snap = path.join(snapDir, 'journal.db');
  try {
    fs.copyFileSync(dbPath, snap);
    for (const suffix of ['-wal', '-shm']) {
      try {
        fs.copyFileSync(dbPath + suffix, snap + suffix);
      } catch (e) {
        // a checkpoint may legitimately remove a sidecar mid-copy
        if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e;
      }
    }
    const { sha256 } = require('./util');
    const wal = fs.existsSync(snap + '-wal') ? fs.readFileSync(snap + '-wal') : Buffer.alloc(0);
    const hash = sha256(Buffer.concat([fs.readFileSync(snap), wal]));

    const BetterSqlite3 = require('better-sqlite3');
    const raw = new BetterSqlite3(snap);
    try {
      // treecontext is resolved by whichever name it is installed under: its
      // npm name is treecontext-mcp, its package and sibling-checkout name
      // treecontext. The first that resolves wins; neither resolving throws
      // TREECONTEXT_MISSING, which the refresh names as an absent journal.
      const { wrapBetterSqlite, FlatStore } = await loadTreecontext();
      const database = wrapBetterSqlite(raw);
      // The snapshot is a throwaway copy, so treecontext may migrate IT
      // freely to its current schema — the source store is never touched
      // (first dogfood run: a live store pending a destructive migration
      // must still be readable without gt ever writing a byte to it).
      const store = await FlatStore.open({
        database,
        namespace,
        migrate: true,
        ownsDatabase: true,
      });
      return {
        query: (text, opts) => store.query(text, opts),
        close: () => {
          try {
            database.close();
          } finally {
            fs.rmSync(snapDir, { recursive: true, force: true });
          }
        },
        hash,
        // Zero nodes is how a namespace typo manifests (FlatStore silently
        // creates an empty tree on a miss) — the caller must name it, never
        // let it read as a quiet all-clear.
        totalNodes: store.status().totalNodes,
      };
    } catch (e) {
      raw.close();
      throw e;
    }
  } catch (e) {
    fs.rmSync(snapDir, { recursive: true, force: true });
    throw e;
  }
}

module.exports = { openJournal, setTreecontextNames, TREECONTEXT_MISSING };
