'use strict';
const fs = require('node:fs');
const path = require('node:path');

/** @typedef {{ file: string, title: string, status: string }} ManifestRow */

const STATUSES = new Set(['passed', 'failed', 'skipped', 'todo', 'unbound']);
const FORMAT = 1;

/**
 * Read a gnt run manifest: NDJSON rows of `{file, title, status}`. An
 * account may open with a schema declaration `{"run-manifest":1}` on its
 * first line (gnt/gct 0.9.0+); a declared account's rows are recorded
 * relative to the manifest file itself and are re-relativized to the
 * corpus root here. A bare-row account keeps its rows verbatim as
 * root-relative (the pre-declaration reading). A zero-byte file is a true
 * account of a run that registered nothing. A malformed line or an
 * unknown declared format throws — a corrupt account must fail the
 * refresh loudly, never silently narrow the binding picture.
 * @param {string} absPath @param {string} root @returns {ManifestRow[]}
 */
function readManifest(absPath, root) {
  const text = fs.readFileSync(absPath, 'utf8');
  /** @type {ManifestRow[]} */
  const rows = [];
  const lines = text.split('\n');
  const manifestDir = path.dirname(absPath);
  let declared = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') continue;
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`${absPath}:${i + 1}: run manifest line is not JSON`);
    }
    const row = /** @type {Record<string, unknown>} */ (parsed);
    if (i === 0 && parsed !== null && typeof parsed === 'object' && 'run-manifest' in row) {
      if (row['run-manifest'] !== FORMAT) {
        throw new Error(
          `${absPath}:1: binding status declares run-manifest format `
          + `${JSON.stringify(row['run-manifest'])}; this tool reads format ${FORMAT}`);
      }
      declared = true;
      continue;
    }
    if (typeof row.file !== 'string' || typeof row.title !== 'string'
      || typeof row.status !== 'string' || !STATUSES.has(row.status)) {
      throw new Error(
        `${absPath}:${i + 1}: run manifest row must be {file, title, status} `
        + `with status one of ${[...STATUSES].join('|')}`);
    }
    const file = declared
      ? path.relative(root, path.resolve(manifestDir, row.file)).split(path.sep).join('/')
      : row.file;
    rows.push({ file, title: row.title, status: row.status });
  }
  return rows;
}

module.exports = { readManifest };
