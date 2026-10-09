'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { compareCodePoints } = require('./util');

/**
 * @typedef {{
 *   root?: string,
 *   featuresDir?: string,
 *   manifest?: string | null,
 *   journal?: string | null,
 *   journalNamespace?: string,
 *   fence?: string | null,
 *   now?: Date,
 * }} GtOptions
 */

/**
 * @typedef {{
 *   root: string,
 *   featuresDir: string,
 *   featuresDirExists: boolean,
 *   featureFiles: string[],
 *   manifest: string | null,
 *   journal: string | null,
 *   journalNamespace: string,
 *   fence: string | null,
 *   shadowedFence: string | null,
 *   pictureDir: string,
 * }} ResolvedSources
 */

/**
 * Resolve options into concrete source paths. A source that is not there is
 * `null` — absence is a fact the refresh reports, never an error here.
 * Feature-file paths are root-relative with `/` separators (the manifest's
 * identity convention), sorted by code point.
 * @param {GtOptions} [opts] @returns {ResolvedSources}
 */
function resolveSources(opts = {}) {
  const root = path.resolve(opts.root ?? process.cwd());
  const featuresDir = path.resolve(root, opts.featuresDir ?? 'features');

  /** @type {string[]} */
  const featureFiles = [];
  const featuresDirExists = fs.existsSync(featuresDir);
  if (featuresDirExists) {
    walk(featuresDir, featuresDir, featureFiles);
  }
  featureFiles.sort(compareCodePoints);
  const rel = featureFiles.map((f) =>
    path.relative(root, path.join(featuresDir, f)).split(path.sep).join('/'));

  const { fence, shadowedFence } = resolveFence(root, featuresDir, opts.fence);

  return {
    root,
    featuresDir,
    featuresDirExists,
    featureFiles: rel,
    manifest: optionalFile(root, opts.manifest, 'run-manifest.ndjson'),
    journal: opts.journal ? existingOrNull(path.resolve(root, opts.journal)) : null,
    journalNamespace: opts.journalNamespace ?? 'project',
    fence,
    shadowedFence,
    pictureDir: path.join(root, '.gherkin-trace'),
  };
}

/**
 * The fence is probed beside the feature files first — the scoping
 * contract's canonical location — then at the root (ruled 2026-08-21).
 * An explicit option always wins and probes nothing; when both
 * conventional files exist the features one is read and the root one is
 * reported shadowed — disclosed, never guessed.
 * @param {string} root @param {string} featuresDir
 * @param {string | null | undefined} given
 * @returns {{ fence: string | null, shadowedFence: string | null }}
 */
function resolveFence(root, featuresDir, given) {
  if (given === null) return { fence: null, shadowedFence: null };
  if (given !== undefined) {
    return { fence: existingOrNull(path.resolve(root, given)), shadowedFence: null };
  }
  const beside = existingOrNull(path.join(featuresDir, 'OUT-OF-SCOPE.md'));
  const atRoot = existingOrNull(path.join(root, 'OUT-OF-SCOPE.md'));
  if (beside !== null) return { fence: beside, shadowedFence: atRoot };
  return { fence: atRoot, shadowedFence: null };
}

/**
 * An explicitly-null option means "no such source"; a string names it; an
 * omitted option falls to the conventional path. Either way a path that
 * does not exist resolves to null — an absent source, not a crash.
 * @param {string} root @param {string | null | undefined} given
 * @param {string} conventional @returns {string | null}
 */
function optionalFile(root, given, conventional) {
  if (given === null) return null;
  return existingOrNull(path.resolve(root, given ?? conventional));
}

/** @param {string} p @returns {string | null} */
function existingOrNull(p) {
  return fs.existsSync(p) ? p : null;
}

/** @param {string} dir @param {string} base @param {string[]} acc */
function walk(dir, base, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, acc);
    else if (entry.name.endsWith('.feature')) {
      acc.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
}

module.exports = { resolveSources };
