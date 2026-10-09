'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const gt = require('../../index');
const W = require('../world');
const journal = require('../../src/journal');

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  // --- givens: project shapes ---------------------------------------------

  define(/^a project with (\d+) scenarios across (\d+) feature files$/,
    async (w, count, files) => {
      W.writeFeatures(w, Number(files), Number(count));
    });

  define(/^binding status for those scenarios$/, (w) => {
    W.writeManifest(w);
  });

  define(/^a journal holding discussion of those scenarios$/, async (w) => {
    await W.writeJournal(w);
  });

  define(/^a project with (\d+) feature files, binding status, and a journal$/,
    async (w, files) => {
      W.writeFeatures(w, Number(files), Number(files) * 2);
      W.writeManifest(w);
      await W.writeJournal(w);
      w.before = W.sourceHashes(w);
    });

  define(/^a picture built by a refresh$/, async (w) => {
    W.writeFeatures(w, 2, 4);
    W.writeManifest(w);
    await W.writeJournal(w);
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    // Baselines for the ownership-refusal outline: a refused request must
    // also have had no effect on sources or picture.
    w.pictureBefore = W.pictureHash(w);
    w.sourcesBefore = W.sourceHashes(w);
  });

  define(/^a project with feature files and binding status but no journal$/,
    (w) => {
      W.writeFeatures(w, 2, 4);
      W.writeManifest(w);
    });

  define(/^a project with feature files and a journal but no binding status$/,
    async (w) => {
      W.writeFeatures(w, 2, 4);
      await W.writeJournal(w);
    });

  define(/^a corpus scenario absent from the binding status source$/, (w) => {
    W.writeFeatures(w, 1, 3);
    w.omitted = w.scenarios[1].title;
    W.writeManifest(w, { omit: [w.omitted] });
  });

  define(/^a project with (\d+) scenarios whose binding status opens with its format declaration$/,
    (w, count) => {
      W.writeFeatures(w, 2, Number(count));
      W.writeManifest(w, { declare: 1 });
    });

  define(/^a project whose binding status declares a format this tool does not read$/,
    (w) => {
      W.writeFeatures(w, 1, 2);
      W.writeManifest(w, { declare: 2 });
    });

  define(/^a project whose declared binding status lives in a subdirectory with rows relative to that subdirectory$/,
    (w) => {
      W.writeFeatures(w, 1, 4);
      W.writeManifest(w, { declare: 1, at: 'accounts/run-manifest.ndjson' });
    });

  define(/^a project with a journal but no feature files$/, async (w) => {
    W.project(w);
    fs.rmSync(path.join(w.dir, 'features'), { recursive: true, force: true });
    await W.createJournalStore(w, [
      { content: 'Discussion with no corpus to attach to.' },
    ]);
  });

  define(/^a features directory containing no scenarios$/, (w) => {
    // gnt's dialect rejects zero-scenario FILES (they would register nothing
    // and read as passing), so an empty corpus is an empty directory: a BDD
    // project declared but not yet specified.
    W.project(w);
    w.scenarios = [];
  });

  define(/^(\d+) feature files of which one fails to parse$/, (w, count) => {
    W.writeFeatures(w, Number(count) - 1, (Number(count) - 1) * 2);
    fs.writeFileSync(path.join(w.dir, 'features', 'broken.feature'), [
      'Feature: Broken area',
      '  Scenario Outline: an outline missing its examples',
      '    Given a step with <placeholder>',
      '',
    ].join('\n'));
  });

  define(/^a project with (\d+) scenarios$/, (w, count) => {
    W.writeFeatures(w, 10, Number(count));
  });

  define(/^a refresh that failed partway through$/, async (w) => {
    W.writeFeatures(w, 1, 2);
    // A prior GOOD picture first — the dangerous world is a stale picture
    // being served as current after the later failure.
    await W.runRefresh(w);
    assert.ok(w.result, `first refresh failed: ${w.error}`);
    // Then a journal that is not a database: the refresh parses features,
    // then fails opening the journal — a genuine partway failure, not a mock.
    const dir = path.join(w.dir, 'journal');
    fs.mkdirSync(dir, { recursive: true });
    w.journalPath = path.join(dir, 'treecontext.db');
    fs.writeFileSync(w.journalPath, 'these bytes are not a sqlite database');
    await W.runRefresh(w);
    assert.ok(w.error, 'expected the refresh to fail');
  });

  define(/^a refresh that is still running$/, async (w) => {
    W.writeFeatures(w, 1, 2);
    await W.writeJournal(w);
    // Start but do not await: refresh acquires its lock before its first
    // await, so the run is in flight from the moment the call returns.
    w.running = gt.refresh({
      root: w.dir,
      journal: w.journalPath,
      manifest: w.manifestPath,
      now: w.clock,
    });
  });

  define(/^a project where no refresh has ever run$/, (w) => {
    W.writeFeatures(w, 1, 2);
  });

  // --- whens ---------------------------------------------------------------

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
  });

  define(/^the picture is deleted and a refresh runs over unchanged sources$/,
    async (w) => {
      w.hashBefore = W.pictureHash(w);
      fs.rmSync(path.join(w.dir, '.gherkin-trace'), { recursive: true, force: true });
      // A later clock proves picture bytes are a function of sources alone.
      w.clock = new Date(w.clock.getTime() + 5 * 60 * 1000);
      await W.runRefresh(w);
      assert.ok(w.result, `rebuild failed: ${w.error}`);
    });

  define(/^the picture is queried for orphan scenarios$/, (w) => {
    w.error = null;
    try {
      w.query = gt.queryOrphans({ root: w.dir });
    } catch (e) {
      w.error = e;
    }
  });

  define(/^a second refresh is started$/, async (w) => {
    w.error = null;
    try {
      await gt.refresh({ root: w.dir, journal: w.journalPath, manifest: w.manifestPath });
    } catch (e) {
      w.error = e;
    }
  });

  define(/^the tool is asked to (.+)$/, (w, request) => {
    w.error = null;
    try {
      if (request.startsWith('edit a feature file')) gt.editFeature();
      else if (request.startsWith('write a note into the journal')) gt.writeJournalNote();
      else if (request.startsWith('mark a scenario as reviewed')) gt.markReviewed();
      else assert.fail(`unmapped request: ${request}`);
    } catch (e) {
      w.error = e;
    }
  });

  // --- thens ---------------------------------------------------------------

  define(/^the picture links each scenario to its bindings and its journal discussion$/,
    (w) => {
      const d = W.dump(w);
      const scenarios = d.nodes.filter((n) => n.kind === 'scenario');
      assert.strictEqual(scenarios.length, w.scenarios.length);
      for (const s of scenarios) {
        const data = /** @type {{bindingStatus: string | null, title: string}} */ (s.data);
        // The manifest recorded every scenario as passed; anything else
        // (including never-run) means the join failed to match.
        assert.strictEqual(data.bindingStatus, 'passed',
          `${data.title}: manifest row not joined`);
        const discussed = d.edges.some((e) => e.class === 'provenance' && e.src === s.id);
        assert.ok(discussed, `${data.title} has no journal discussion linked`);
      }
    });

  define(/^the report states the refresh time and the sources read$/, (w) => {
    assert.strictEqual(w.result.refreshedAt, '2026-07-27 14:10');
    const sources = w.result.sources;
    assert.strictEqual(sources.featureFiles.length, 3, 'not every feature file named as read');
    assert.strictEqual(sources.manifest, 'run-manifest.ndjson');
    assert.strictEqual(sources.journal, 'journal/treecontext.db');
  });

  define(/^every feature file, binding registry, and journal store is byte-for-byte unchanged$/,
    (w) => {
      // The refresh must actually have READ the sources — a refresh that
      // crashed on entry would leave hashes trivially unchanged.
      assert.ok(w.result, `refresh did not complete: ${w.error}`);
      assert.deepStrictEqual(W.sourceHashes(w), w.before);
    });

  define(/^the rebuilt picture is identical to the deleted one$/, (w) => {
    assert.strictEqual(W.pictureHash(w), w.hashBefore);
  });

  define(/^the picture is built from the feature files and binding status$/, (w) => {
    const d = W.dump(w);
    const scenarios = d.nodes.filter((n) => n.kind === 'scenario');
    assert.strictEqual(scenarios.length, w.scenarios.length);
    for (const s of scenarios) {
      assert.ok(/** @type {{bindingStatus: string}} */ (s.data).bindingStatus);
    }
  });

  define(/^the picture is built from the feature files and the journal$/, (w) => {
    const d = W.dump(w);
    const scenarios = d.nodes.filter((n) => n.kind === 'scenario');
    assert.strictEqual(scenarios.length, w.scenarios.length);
    for (const s of scenarios) {
      const discussed = d.edges.some((e) => e.class === 'provenance' && e.src === s.id);
      assert.ok(discussed, `${/** @type {{title: string}} */ (s.data).title} lost its journal link`);
      // With no manifest at all the column is truly empty — null, never a
      // fabricated never-run flag.
      assert.strictEqual(/** @type {{bindingStatus: unknown}} */ (s.data).bindingStatus, null);
    }
  });

  define(/^the report names the journal as absent$/, (w) => {
    assert.ok(w.result.absent.includes('journal'));
  });

  define(/^treecontext is not installed beside gherkin-trace$/, (w) => {
    // The suite runs with treecontext installed as a sibling: stage its
    // absence by pointing the loader at names nothing resolves, and restore
    // the real list after the scenario, pass or fail.
    const previous = journal.setTreecontextNames(['treecontext-mcp-absent', 'treecontext-absent']);
    w.defer(() => journal.setTreecontextNames(previous));
  });

  define(/^the report names the journal as absent and says treecontext is not installed$/, (w) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    assert.ok(w.result.absent.includes('journal'));
    assert.strictEqual(w.result.sources.journal, null);
    assert.ok(w.result.notes.some((/** @type {string} */ n) =>
      n.includes('not installed') && n.includes('treecontext-mcp')),
      `notes do not teach the install: ${JSON.stringify(w.result.notes)}`);
  });

  define(/^the report names binding status as absent$/, (w) => {
    assert.ok(w.result.absent.includes('binding status'));
  });

  define(/^the report names heat, provenance, and review status as dark$/, (w) => {
    for (const signal of ['heat', 'provenance', 'review status']) {
      assert.ok(w.result.dark.includes(signal), `${signal} not named dark`);
    }
  });

  define(/^the report names binding signals as dark$/, (w) => {
    assert.ok(w.result.dark.includes('binding signals'));
  });

  define(/^the scenario is flagged as never run$/, (w) => {
    const d = W.dump(w);
    const node = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === w.omitted);
    assert.ok(node, 'omitted scenario missing from picture');
    w.flag = /** @type {{bindingStatus: unknown}} */ (node.data).bindingStatus;
    assert.strictEqual(w.flag, 'never-run');
    // And the scenarios the runner DID see joined as passed — an
    // everything-is-never-run world must not slip through.
    for (const s of d.nodes.filter((n) => n.kind === 'scenario')) {
      const data = /** @type {{title: string, bindingStatus: unknown}} */ (s.data);
      if (data.title !== w.omitted) assert.strictEqual(data.bindingStatus, 'passed');
    }
  });

  define(/^the flag is distinct from an empty binding column$/, (w) => {
    // An absent manifest leaves the column null; never-run is a stated flag.
    assert.notStrictEqual(w.flag, null);
    assert.notStrictEqual(w.flag, '');
  });

  define(/^the picture links all (\d+) scenarios to their binding status$/, (w, n) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const d = W.dump(w);
    const scenarios = d.nodes.filter((x) => x.kind === 'scenario');
    assert.strictEqual(scenarios.length, Number(n));
    for (const s of scenarios) {
      const data = /** @type {{bindingStatus: string | null, title: string}} */ (s.data);
      assert.strictEqual(data.bindingStatus, 'passed',
        `${data.title}: binding row not joined`);
    }
  });

  define(/^the declaration adds no scenario and no unmatched row$/, (w) => {
    assert.strictEqual(w.result.unmatchedManifestRows, 0);
    const d = W.dump(w);
    assert.strictEqual(d.nodes.filter((x) => x.kind === 'scenario').length,
      w.scenarios.length);
  });

  define(/^the refresh fails naming the declared format and the format this tool reads$/,
    (w) => {
      assert.ok(w.error instanceof gt.GtRefreshFailure,
        `expected a refresh failure, got ${w.error}`);
      assert.ok(w.error.message.includes('declares run-manifest format 2'),
        `failure "${w.error.message}" does not name the declared format`);
      assert.ok(w.error.message.includes('reads format 1'),
        `failure "${w.error.message}" does not name the format this tool reads`);
    });

  define(/^the failure names the binding status file$/, (w) => {
    assert.ok(w.error.message.includes('run-manifest.ndjson'),
      `failure "${w.error.message}" does not name the binding status file`);
  });

  define(/^no picture is built$/, (w) => {
    assert.ok(w.error instanceof gt.GtRefusal, `expected refusal, got ${w.error}`);
    assert.ok(!fs.existsSync(path.join(w.dir, '.gherkin-trace', 'picture.db')));
  });

  define(/^the picture holds zero scenarios$/, (w) => {
    const d = W.dump(w);
    assert.strictEqual(d.nodes.filter((n) => n.kind === 'scenario').length, 0);
  });

  define(/^the report states zero scenarios with the refresh time$/, (w) => {
    assert.strictEqual(w.result.counts.scenarios, 0);
    assert.strictEqual(w.result.refreshedAt, '2026-07-27 14:10');
    // A truly stated empty corpus — nothing quietly excepted away.
    assert.deepStrictEqual(w.result.exceptions, []);
    assert.strictEqual(w.result.counts.features, 0);
  });

  define(/^the picture is built from the (\d+) files that parse$/, (w, n) => {
    const d = W.dump(w);
    const features = d.nodes.filter((x) => x.kind === 'feature');
    assert.strictEqual(features.length, Number(n));
    assert.ok(!features.some((f) =>
      /** @type {{file: string}} */ (f.data).file.includes('broken')));
  });

  define(/^the report names the failing file with its parse error$/, (w) => {
    const ex = w.result.exceptions.find(
      (/** @type {{file: string}} */ x) => x.file === 'features/broken.feature');
    assert.ok(ex, 'failing file not named');
    assert.ok(ex.error.length > 0, 'parse error not carried');
    w.exception = ex;
  });

  define(/^the report states that the failing file's scenarios are absent from the picture$/,
    (w) => {
      assert.ok(w.exception.statement.includes('absent from the picture'));
    });

  define(/^the picture holds all (\d+) scenarios$/, (w, n) => {
    const d = W.dump(w);
    assert.strictEqual(d.nodes.filter((x) => x.kind === 'scenario').length, Number(n));
  });

  define(/^the report carries no size warning$/, (w) => {
    // The summary's key set is closed — no warning field of any name can
    // ride along unnoticed.
    assert.deepStrictEqual(Object.keys(w.result).sort(), [
      'absent', 'closedThreads', 'conditions', 'counts', 'dark', 'exceptions',
      'generation', 'notes', 'refreshedAt', 'sources', 'unmatchedManifestRows',
    ]);
    // Conditions are the single source and never mirror into notes, so the
    // zero-notes guard holds even though this all-UAT corpus carries the
    // design-tier-absent condition.
    assert.deepStrictEqual(w.result.notes, []);
    assert.ok(!JSON.stringify(w.result).toLowerCase().includes('size'));
  });

  define(/^the query is refused$/, (w) => {
    assert.ok(w.error instanceof gt.GtRefusal, `expected refusal, got ${w.error}`);
  });

  define(/^the second refresh is refused$/, async (w) => {
    assert.ok(w.error instanceof gt.GtRefusal, `expected refusal, got ${w.error}`);
    // The first refresh finishes untouched by the refused second one.
    assert.ok(await w.running);
    // And the refusal was about the RUNNING refresh, not a lock leak: once
    // the first completes, a new refresh succeeds.
    const after = await gt.refresh({
      root: w.dir, journal: w.journalPath, manifest: w.manifestPath, now: w.clock,
    });
    assert.ok(after, 'refresh after completion should succeed — lock was never released');
  });

  define(/^the refusal names the refresh already running$/, (w) => {
    assert.ok(w.error.message.includes('already running'));
    assert.ok(w.error.message.includes('started'), 'refusal does not identify the running refresh');
  });

  define(/^the request is refused$/, (w) => {
    assert.ok(w.error instanceof gt.GtRefusal, `expected refusal, got ${w.error}`);
    // Refused means refused: neither sources nor picture were touched.
    if (w.pictureBefore) assert.strictEqual(W.pictureHash(w), w.pictureBefore);
    if (w.sourcesBefore) assert.deepStrictEqual(W.sourceHashes(w), w.sourcesBefore);
  });

  define(/^the refusal states that (.+)$/, (w, expectation) => {
    assert.ok(w.error, 'no refusal was captured');
    const clauses = expectation.split(' and that ');
    for (const clause of clauses) {
      assert.ok(w.error.message.includes(clause),
        `refusal "${w.error.message}" does not state "${clause}"`);
    }
  });
};
