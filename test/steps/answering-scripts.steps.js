'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const W = require('../world');

// The exit-code contract is CLI behavior, so these bindings spawn the real
// bin — the same process boundary a CI step sees.

const BIN = path.join(__dirname, '..', '..', 'bin', 'gt.js');

/** @param {Record<string, any>} w @param {string[]} args */
function runCli(w, args) {
  const extra = [];
  if (w.journalPath) extra.push('--journal', w.journalPath);
  const r = spawnSync(process.execPath, [BIN, ...args, ...extra], {
    cwd: w.dir,
    encoding: 'utf8',
  });
  w.cli = { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  // --- givens ---------------------------------------------------------------

  define(/^a project with feature files, binding status, and a journal$/, async (w) => {
    W.writeFeatures(w, 2, 4);
    W.writeManifest(w);
    await W.writeJournal(w);
  });

  define(/^a project with feature files but no journal and no binding status$/, (w) => {
    W.writeFeatures(w, 2, 4);
  });

  define(/^a project with a journal but no feature files$/, async (w) => {
    W.project(w);
    await W.writeJournal(w);
    fs.rmSync(path.join(w.dir, 'features'), { recursive: true, force: true });
  });

  define(/^a project whose journal store is not a database$/, (w) => {
    W.writeFeatures(w, 1, 2);
    const dir = path.join(w.dir, 'journal');
    fs.mkdirSync(dir, { recursive: true });
    w.journalPath = path.join(dir, 'treecontext.db');
    fs.writeFileSync(w.journalPath, 'these bytes are not a sqlite database');
  });

  define(/^a project whose last refresh failed partway$/, (w) => {
    W.writeFeatures(w, 1, 2);
    const dir = path.join(w.dir, 'journal');
    fs.mkdirSync(dir, { recursive: true });
    w.journalPath = path.join(dir, 'treecontext.db');
    fs.writeFileSync(w.journalPath, 'these bytes are not a sqlite database');
    runCli(w, ['refresh']);
    assert.strictEqual(w.cli.status, 1, `expected the setup refresh to fail: ${w.cli.stderr}`);
  });

  define(/^a refresh has run from the command line$/, (w) => {
    runCli(w, ['refresh']);
    assert.strictEqual(w.cli.status, 0, `setup refresh failed: ${w.cli.stderr}`);
  });

  // --- whens ----------------------------------------------------------------

  define(/^a refresh runs from the command line$/, (w) => {
    runCli(w, ['refresh']);
  });

  define(/^the attention list is asked for from the command line$/, (w) => {
    runCli(w, ['attention']);
  });

  define(/^the attention list and the report are asked for from the command line$/, (w) => {
    runCli(w, ['attention']);
    const first = w.cli;
    runCli(w, ['report']);
    w.cliPair = [first, w.cli];
  });

  define(/^an unknown command and a query missing its argument are tried$/, (w) => {
    runCli(w, ['not-a-command']);
    const first = w.cli;
    runCli(w, ['up']);
    w.cliPair = [first, w.cli];
  });

  define(/^help is asked for alongside a refresh command$/, (w) => {
    runCli(w, ['refresh', '--help']);
  });

  // --- thens ----------------------------------------------------------------

  define(/^the exit code is (\d+)$/, (w, code) => {
    assert.strictEqual(w.cli.status, Number(code),
      `exit ${w.cli.status}; stderr: ${w.cli.stderr}`);
    // An answer is an answer: exit 0 must not ride with stderr noise a
    // pipeline would log as trouble.
    if (Number(code) === 0) assert.strictEqual(w.cli.stderr, '');
  });

  define(/^both exit codes are (\d+)$/, (w, code) => {
    for (const r of w.cliPair) {
      assert.strictEqual(r.status, Number(code), `exit ${r.status}; stderr: ${r.stderr}`);
    }
  });

  define(/^both answers arrive on stdout with a clean stderr$/, (w) => {
    for (const r of w.cliPair) {
      assert.ok(r.stdout.length > 0, 'an answer is missing from stdout');
      assert.strictEqual(r.stderr, '');
    }
  });

  define(/^the usage is printed$/, (w) => {
    assert.ok(w.cli.stdout.includes('usage: gt'), w.cli.stdout);
  });

  define(/^the printed summary names the absent sources$/, (w) => {
    const summary = JSON.parse(w.cli.stdout);
    assert.ok(summary.absent.includes('binding status'), 'binding status not named absent');
    assert.ok(summary.absent.includes('journal'), 'journal not named absent');
  });

  define(/^the refusal is printed on stderr$/, (w) => {
    assert.match(w.cli.stderr, /^refused: /);
    // A refusal answers nothing — a piping script must not receive a
    // half-answer on stdout beside the refusal.
    assert.strictEqual(w.cli.stdout, '');
  });

  define(/^the failure is printed on stderr$/, (w) => {
    assert.match(w.cli.stderr, /^failed: /);
  });

  define(/^no picture directory exists$/, (w) => {
    assert.ok(!fs.existsSync(path.join(w.dir, '.gherkin-trace')),
      'a refusal must touch nothing, but .gherkin-trace exists');
  });

  define(/^the picture on disk is marked broken$/, (w) => {
    const broken = JSON.parse(
      fs.readFileSync(path.join(w.dir, '.gherkin-trace', 'broken.json'), 'utf8'));
    assert.ok(broken.error, 'broken.json carries no error');
  });
};
