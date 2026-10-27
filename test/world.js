'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const gt = require('../index');

// Sandbox project helpers for the contract bindings. Each scenario gets a
// throwaway project directory; the world object `w` carries its paths and
// the outcome of the last action (result or refusal).

/** @param {Record<string, any>} w */
function project(w) {
  if (!w.dir) {
    w.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-'));
    fs.mkdirSync(path.join(w.dir, 'features'), { recursive: true });
    w.journalPath = null;
    w.manifestPath = null;
    w.clock = new Date('2026-07-27T14:10:00Z');
  }
  return w.dir;
}

/**
 * Write feature files: `count` scenarios spread across `files` files.
 * Titles are globally unique and never substrings of one another.
 * @param {Record<string, any>} w @param {number} files @param {number} count
 */
function writeFeatures(w, files, count) {
  project(w);
  w.scenarios = [];
  const per = Math.ceil(count / files);
  let n = 0;
  for (let f = 1; f <= files; f++) {
    const lines = [`Feature: Area ${f}`];
    for (let s = 0; s < per && n < count; s++, n++) {
      const title = `Scenario ${f}x${s} settles cleanly`;
      lines.push(`  Scenario: ${title}`);
      lines.push(`    Given a precondition ${f}x${s}`);
      lines.push(`    Then an outcome ${f}x${s} holds`);
      w.scenarios.push({ file: `features/area-${f}.feature`, title });
    }
    fs.writeFileSync(path.join(w.dir, `features/area-${f}.feature`), lines.join('\n') + '\n');
  }
}

/**
 * Write a run manifest covering the project's scenarios (status `passed`
 * unless overridden per-title), minus any titles in `omit` — those become
 * the never-run cases. `declare` writes a `{"run-manifest":N}` first line
 * (the gnt 0.9.0 account shape) and, per that format, records rows
 * relative to the manifest's own location; `at` places the manifest at a
 * root-relative path other than the default.
 * @param {Record<string, any>} w
 * @param {{ omit?: string[], statuses?: Record<string, string>,
 *   declare?: number, at?: string }} [opts]
 */
function writeManifest(w, opts = {}) {
  project(w);
  const omit = new Set(opts.omit ?? []);
  const statuses = opts.statuses ?? {};
  const at = opts.at ?? 'run-manifest.ndjson';
  const declared = opts.declare !== undefined;
  const manifestDir = path.posix.dirname(at);
  const rows = (w.scenarios ?? [])
    .filter((/** @type {{title: string}} */ s) => !omit.has(s.title))
    .map((/** @type {{file: string, title: string}} */ s) =>
      JSON.stringify({
        file: declared
          ? path.posix.relative(manifestDir === '.' ? '' : manifestDir, s.file)
          : s.file,
        title: s.title,
        status: statuses[s.title] ?? 'passed',
      }));
  if (declared) rows.unshift(JSON.stringify({ 'run-manifest': opts.declare }));
  w.manifestPath = path.join(w.dir, at);
  fs.mkdirSync(path.dirname(w.manifestPath), { recursive: true });
  fs.writeFileSync(w.manifestPath, rows.length ? rows.join('\n') + '\n' : '');
}

/**
 * Create a real treecontext store holding one dated discussion entry per
 * scenario (each mentions the full title), plus any extra entries.
 * @param {Record<string, any>} w
 * @param {Array<{content: string, role?: string, sessionId?: string, createdAt?: number}>} [extra]
 */
async function writeJournal(w, extra = []) {
  project(w);
  const entries = (w.scenarios ?? []).map(
    (/** @type {{title: string}} */ s, /** @type {number} */ i) => ({
      content: `We discussed "${s.title}" and settled its steps.`,
      role: 'user',
      sessionId: 'session-one',
      createdAt: 1753000000 + i * 60,
    }));
  await createJournalStore(w, [...entries, ...extra]);
}

/**
 * @param {Record<string, any>} w
 * @param {Array<{content: string, role?: string, sessionId?: string, createdAt?: number}>} entries
 */
async function createJournalStore(w, entries) {
  project(w);
  const { openNodeSqlite } = await import('treecontext/persistence/node');
  const { FlatStore } = await import('treecontext');
  const dir = path.join(w.dir, 'journal');
  fs.mkdirSync(dir, { recursive: true });
  w.journalPath = path.join(dir, 'treecontext.db');
  const database = openNodeSqlite(w.journalPath);
  const store = await FlatStore.open({ database, namespace: 'project' });
  for (const e of entries) {
    await store.insert(e.content, {
      metadata: {
        role: e.role ?? 'user',
        session_id: e.sessionId ?? 'session-one',
      },
      createdAt: e.createdAt ?? 1753000000,
    });
  }
  database.close();
}

/**
 * Append entries to the sandbox's existing journal store.
 * @param {Record<string, any>} w
 * @param {Array<{content: string, role?: string, sessionId?: string, createdAt?: number}>} entries
 */
async function addJournalEntries(w, entries) {
  const { openNodeSqlite } = await import('treecontext/persistence/node');
  const { FlatStore } = await import('treecontext');
  const database = openNodeSqlite(w.journalPath);
  const store = await FlatStore.open({ database, namespace: 'project' });
  for (const e of entries) {
    await store.insert(e.content, {
      metadata: {
        role: e.role ?? 'user',
        session_id: e.sessionId ?? 'session-one',
      },
      createdAt: e.createdAt ?? 1753000000,
    });
  }
  database.close();
}

/** @param {string} iso @returns {number} unix seconds */
function toUnix(iso) {
  return Math.floor(Date.parse(iso) / 1000);
}

/**
 * Run a refresh against the sandbox, capturing either the summary or the
 * refusal/failure — steps assert on whichever the scenario expects.
 * @param {Record<string, any>} w @param {Record<string, any>} [extra]
 */
async function runRefresh(w, extra = {}) {
  project(w);
  w.result = null;
  w.error = null;
  try {
    w.result = await gt.refresh({
      root: w.dir,
      journal: w.journalPath,
      manifest: w.manifestPath,
      now: w.clock,
      ...extra,
    });
  } catch (e) {
    w.error = e;
  }
}

/** @param {Record<string, any>} w @returns {ReturnType<typeof gt.dumpPicture>} */
function dump(w) {
  return gt.dumpPicture(path.join(w.dir, '.gherkin-trace'));
}

/** @param {Record<string, any>} w */
function gitInit(w) {
  project(w);
  const { execFileSync } = require('node:child_process');
  execFileSync('git', ['-C', w.dir, 'init', '-q']);
  execFileSync('git', ['-C', w.dir, 'config', 'user.email', 'world@test']);
  execFileSync('git', ['-C', w.dir, 'config', 'user.name', 'World']);
}

/**
 * Commit everything with a pinned date, so change dating is deterministic.
 * @param {Record<string, any>} w @param {string} message @param {string} isoDate
 */
function gitCommit(w, message, isoDate) {
  const { execFileSync } = require('node:child_process');
  execFileSync('git', ['-C', w.dir, 'add', '-A']);
  execFileSync('git', ['-C', w.dir, 'commit', '-q', '--allow-empty', '-m', message], {
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: isoDate,
      GIT_COMMITTER_DATE: isoDate,
    },
  });
}

/** @param {Record<string, any>} w @param {string} rel @param {string} content */
function writeFile(w, rel, content) {
  project(w);
  const abs = path.join(w.dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** @param {Record<string, any>} w @returns {string} sha256 of picture.db */
function pictureHash(w) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(w.dir, '.gherkin-trace', 'picture.db')))
    .digest('hex');
}

/**
 * Hash every source file in the sandbox (features, manifest, journal db,
 * fence) — the byte-for-byte-unchanged check reads through this.
 * @param {Record<string, any>} w @returns {Record<string, string>}
 */
function sourceHashes(w) {
  /** @type {Record<string, string>} */
  const out = {};
  const files = [];
  const featuresDir = path.join(w.dir, 'features');
  if (fs.existsSync(featuresDir)) {
    for (const f of fs.readdirSync(featuresDir, { recursive: true, encoding: 'utf8' })) {
      const full = path.join(featuresDir, f);
      if (fs.statSync(full).isFile()) files.push(full);
    }
  }
  if (w.manifestPath && fs.existsSync(w.manifestPath)) files.push(w.manifestPath);
  if (w.journalPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      const p = w.journalPath + suffix;
      if (fs.existsSync(p)) files.push(p);
    }
  }
  for (const fp of ['OUT-OF-SCOPE.md', path.join('features', 'OUT-OF-SCOPE.md')]) {
    const fence = path.join(w.dir, fp);
    if (fs.existsSync(fence)) files.push(fence);
  }
  for (const f of files.sort()) {
    out[f] = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  }
  return out;
}

/**
 * Strings-only step definer. gherkin-node-test >= 0.10 types step
 * captures as `string | DataTable`; this suite has no data-table steps
 * (its two tables are Scenario Outline examples, which arrive substituted
 * into the step text), so every capture is a string. The cast lives here
 * once instead of at every definition.
 * @param {import('gherkin-node-test').StepRegistry} reg
 * @returns {(pattern: RegExp, fn: (w: Record<string, any>, ...args: string[]) => void | Promise<void>) => void}
 */
function stringSteps(reg) {
  return (pattern, fn) => {
    reg.define(pattern, /** @type {import('gherkin-node-test').StepFn} */ (fn));
  };
}

module.exports = {
  stringSteps,
  project,
  writeFeatures,
  writeManifest,
  writeJournal,
  createJournalStore,
  runRefresh,
  dump,
  pictureHash,
  sourceHashes,
  gitInit,
  gitCommit,
  writeFile,
  addJournalEntries,
  toUnix,
};
