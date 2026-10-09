'use strict';
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const W = require('../world');

// Spec dilution worlds: git repos with committed feature edits, committed
// run manifests (each manifest commit is a recorded run), journal rulings
// anchoring review, and Sanctioned-changes fence sections. Assertions read
// gt's consumer surface — the picture dump, the attention list, and the
// dilution timeline query — never gt's internals.

/** @param {Record<string, any>} w @param {string[]} args */
function git(w, args) {
  return execFileSync('git', ['-C', w.dir, ...args], { encoding: 'utf8' }).trim();
}

/** @param {Record<string, any>} w @param {string} msg @param {string} date @returns {string} commit hash */
function commit(w, msg, date) {
  W.gitCommit(w, msg, date);
  const hash = git(w, ['rev-parse', 'HEAD']);
  w.commitByDate = w.commitByDate ?? {};
  w.commitByDate[date.slice(0, 10)] = hash;
  return hash;
}

/**
 * @param {string} title @param {number} thens @param {{reword?: string, flavor?: string}} [opts]
 */
function scenarioBlock(title, thens, opts = {}) {
  const suffix = opts.reword === undefined ? '' : ` ${opts.reword}`;
  const lines = opts.flavor === 'card'
    ? [
      `  Scenario: ${title}`,
      '    Given a stored card on the account',
      '    When the charge is submitted to the network',
      `    Then the network acknowledges the charge${suffix}`,
    ]
    : [
      `  Scenario: ${title}`,
      '    Given a paid order',
      '    When the refund is requested',
      `    Then the refund settles${suffix}`,
    ];
  for (let i = 1; i < thens; i++) lines.push(`    And check ${i} holds${suffix}`);
  return lines;
}

/**
 * Write the target feature file from the world's scenario table.
 * @param {Record<string, any>} w
 */
function writeFeature(w) {
  const lines = ['Feature: Payments'];
  for (const s of w.specs) lines.push(...scenarioBlock(s.title, s.thens, s));
  W.writeFile(w, w.featureFile, lines.join('\n') + '\n');
}

/**
 * Commit a recorded run: one manifest row per world scenario (or explicit
 * rows), then a git commit dated `date` — the run's date.
 * @param {Record<string, any>} w
 * @param {Record<string, string>} statuses title → status (default passed)
 * @param {string} date ISO day
 * @param {{omit?: string[]}} [opts]
 */
function recordRun(w, statuses, date, opts = {}) {
  const omit = new Set(opts.omit ?? []);
  const rows = w.specs
    .filter((/** @type {{title: string}} */ s) => !omit.has(s.title))
    .map((/** @type {{title: string}} */ s) => JSON.stringify({
      file: w.featureFile, title: s.title, status: statuses[s.title] ?? 'passed',
    }));
  W.writeFile(w, 'run-manifest.ndjson', rows.join('\n') + '\n');
  w.manifestPath = path.join(w.dir, 'run-manifest.ndjson');
  commit(w, `run ${date}`, `${date}T12:00:00Z`);
}

/**
 * @param {Record<string, any>} w
 * @param {Array<{title: string, directions: string, date: string, file?: string}>} entries
 * @param {string} commitDate
 */
function writeFence(w, entries, commitDate) {
  const lines = ['# Out of scope', '', '## Declined', '',
    '- **Umbrella pricing** — bulk pricing bundles are declined territory. (2026-07-01)', ''];
  if (entries.length > 0) {
    lines.push('## Sanctioned changes', '');
    for (const e of entries) {
      lines.push(`- **${e.file ?? w.featureFile}** / "${e.title}" — ${e.directions}.`,
        `  Ruled during scoping. (${e.date})`);
    }
    lines.push('');
  }
  W.writeFile(w, 'OUT-OF-SCOPE.md', lines.join('\n'));
  if (commitDate !== '') commit(w, 'fence', `${commitDate}T09:00:00Z`);
}

/**
 * Base world: one reviewed scenario committed with a journal ruling.
 * @param {Record<string, any>} w @param {string} title
 * @param {{thens?: number, ruling?: boolean, initDate?: string}} [opts]
 */
async function baseWorld(w, title, opts = {}) {
  W.gitInit(w);
  w.clock = new Date('2026-08-20T10:00:00Z');
  w.featureFile = 'features/payments.feature';
  w.title = title;
  w.specs = [{ title, thens: opts.thens ?? 2 }];
  writeFeature(w);
  writeFence(w, [], '');
  commit(w, 'corpus', `${opts.initDate ?? '2026-07-20'}T10:00:00Z`);
  if (opts.ruling !== false) {
    await W.createJournalStore(w, [{
      content: `Ruling: "${title}" is approved as specified.`,
      role: 'user',
      sessionId: 'review-session',
      createdAt: W.toUnix(`${opts.initDate ?? '2026-07-20'}T11:00:00Z`),
    }]);
  }
}

/** @param {Record<string, any>} w @param {string} title */
function findScenario(w, title) {
  const d = W.dump(w);
  const node = d.nodes.find((n) => (n.kind === 'scenario' || n.kind === 'outline')
    && /** @type {{title: string}} */ (n.data).title === title);
  assert.ok(node, `scenario "${title}" missing from the picture`);
  return /** @type {{data: Record<string, any>}} */ (node);
}

/** @param {Record<string, any>} w @param {string} title @param {string} signal */
function findSignal(w, title, signal) {
  const node = findScenario(w, title);
  const signals = node.data.dilution?.signals ?? [];
  const hit = signals.find((/** @type {{signal: string}} */ s) => s.signal === signal);
  assert.ok(hit, `"${title}" carries no "${signal}" signal; has: ${
    JSON.stringify(signals.map((/** @type {{signal: string}} */ s) => s.signal))}`);
  return hit;
}

/** @param {Record<string, any>} w */
function attention(w) {
  const gt = require('../../index');
  return gt.queryAttention({ root: w.dir, journal: w.journalPath });
}

/** @param {Record<string, any>} w @param {string} title */
function itemOf(w, title) {
  const list = attention(w);
  return list.items.find((/** @type {{title?: string}} */ i) => i.title === title);
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  // --- shared When steps ---------------------------------------------------

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the attention list is asked for$/, async (w) => {
    if (!w.result) {
      await W.runRefresh(w);
      assert.ok(w.result, `refresh failed: ${w.error}`);
    }
    w.list = attention(w);
  });

  define(/^the dilution timeline is asked for "([^"]+)"$/, async (w, title) => {
    if (!w.result) {
      await W.runRefresh(w);
      assert.ok(w.result, `refresh failed: ${w.error}`);
    }
    const gt = require('../../index');
    try {
      w.answer = gt.queryDilution(title, { root: w.dir, journal: w.journalPath });
      w.refusal = null;
    } catch (e) {
      if (!(e instanceof gt.GtRefusal)) throw e;
      w.refusal = e.message;
      w.answer = null;
    }
  });

  // --- sightings -----------------------------------------------------------

  define(/^the reviewed scenario "([^"]+)" failing at the recorded run dated "([^"]+)"$/,
    async (w, title, date) => {
      await baseWorld(w, title);
      recordRun(w, { [title]: 'failed' }, date);
    });

  define(/^a commit dated "([^"]+)" reworded its Then steps while it was failing$/,
    (w, date) => {
      w.specs[0].reword = 'promptly';
      writeFeature(w);
      w.editHash = commit(w, 'reword', `${date}T10:00:00Z`);
    });

  define(/^the recorded run dated "([^"]+)" shows it passing$/, (w, date) => {
    recordRun(w, {}, date);
  });

  define(/^no sanction in the fence covers the (?:edit|edits|deletion)$/, (w) => {
    // The fence written at world start carries no Sanctioned-changes
    // section — checkable from the file itself.
    const fs = require('node:fs');
    const text = fs.readFileSync(path.join(w.dir, 'OUT-OF-SCOPE.md'), 'utf8');
    assert.ok(!text.includes('Sanctioned changes'), 'fixture fence unexpectedly carries sanctions');
  });

  define(/^a dilution sighting names the commit dated "([^"]+)" and the verdict flip$/,
    (w, date) => {
      const hit = findSignal(w, w.title, 'verdict-coupled edit');
      assert.strictEqual(hit.evidence.commit, w.commitByDate[date],
        'sighting does not name the edit commit');
      assert.ok(String(hit.evidence.flippedGreenAt).length > 0, 'sighting names no flip');
    });

  define(/^the sighting ranks at the verdict-coupled tier$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the scenario');
    assert.strictEqual(item.tier, 'verdict-coupled');
  });

  define(/^the reviewed scenario "([^"]+)" passing at every recorded run$/,
    async (w, title) => {
      await baseWorld(w, title, { thens: 4 });
      recordRun(w, {}, '2026-07-31');
    });

  define(/^its assertion count fell from 4 to 3 to 2 across commits dated "([^"]+)", "([^"]+)", and "([^"]+)"$/,
    (w, d1, d2, d3) => {
      w.specs[0].thens = 3;
      writeFeature(w);
      const shed1 = commit(w, 'shed one', `${d2}T10:00:00Z`);
      recordRun(w, {}, d2);
      w.specs[0].thens = 2;
      writeFeature(w);
      const shed2 = commit(w, 'shed two', `${d3}T10:00:00Z`);
      recordRun(w, {}, d3);
      // d1 is the creation commit's mass point (4); the shedding commits
      // are the two edits, captured directly — run commits share the days.
      w.shedHashes = [shed1, shed2];
    });

  define(/^a dilution sighting carries the count series 4, 3, 2$/, (w) => {
    const hit = findSignal(w, w.title, 'assertion decline');
    assert.deepStrictEqual(hit.evidence.series, [4, 3, 2]);
  });

  define(/^the sighting names the three shedding commits$/, (w) => {
    const hit = findSignal(w, w.title, 'assertion decline');
    const commits = /** @type {Array<{commit: string}>} */ (hit.evidence.sheddingCommits)
      .map((c) => c.commit);
    assert.deepStrictEqual(commits, w.shedHashes,
      'shedding commits do not match the shedding edits');
  });

  define(/^the sighting ranks at the assertion-decline tier$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the scenario');
    assert.strictEqual(item.tier, 'assertion-decline');
  });

  define(/^its assertion count grew from 2 to 4 across two commits with no journal discussion in the change interval$/,
    (w) => {
      w.specs[0].thens = 3;
      writeFeature(w);
      commit(w, 'grow one', '2026-08-02T10:00:00Z');
      w.specs[0].thens = 4;
      writeFeature(w);
      commit(w, 'grow two', '2026-08-04T10:00:00Z');
      recordRun(w, {}, '2026-08-05');
    });

  define(/^no assertion-decline sighting fires$/, (w) => {
    const node = findScenario(w, w.title);
    const signals = node.data.dilution?.signals ?? [];
    assert.ok(!signals.some((/** @type {{signal: string}} */ s) => s.signal === 'assertion decline'),
      'a growing series fired an assertion-decline sighting');
  });

  define(/^the edits report at the quiet-edit tier$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the scenario');
    assert.strictEqual(item.tier, 'quiet-edit');
  });

  define(/^the reviewed scenario outline "([^"]+)" passing at every recorded run$/,
    async (w, name) => {
      W.gitInit(w);
      w.clock = new Date('2026-08-20T10:00:00Z');
      w.featureFile = 'features/retries.feature';
      w.title = name;
      w.outlineRows = 5;
      w.specs = [];
      writeOutline(w);
      writeFence(w, [], '');
      commit(w, 'corpus', '2026-07-20T10:00:00Z');
      await W.createJournalStore(w, [{
        content: `Ruling: "${name} [1]" is approved as specified.`,
        role: 'user',
        sessionId: 'review-session',
        createdAt: W.toUnix('2026-07-20T11:00:00Z'),
      }]);
      recordOutlineRun(w, '2026-07-31');
    });

  /** @param {Record<string, any>} w */
  function writeOutline(w) {
    const lines = ['Feature: Retries',
      `  Scenario Outline: ${w.title}`,
      '    Given <n> failed attempts',
      '    When the retry budget is checked',
      '    Then the retry gives up',
      '  Examples:',
      '    | n |'];
    for (let i = 1; i <= w.outlineRows; i++) lines.push(`    | ${i} |`);
    W.writeFile(w, w.featureFile, lines.join('\n') + '\n');
  }

  /** @param {Record<string, any>} w @param {string} date */
  function recordOutlineRun(w, date) {
    const rows = [];
    for (let i = 1; i <= w.outlineRows; i++) {
      rows.push(JSON.stringify({
        file: w.featureFile, title: `${w.title} [${i}]`, status: 'passed',
      }));
    }
    W.writeFile(w, 'run-manifest.ndjson', rows.join('\n') + '\n');
    w.manifestPath = path.join(w.dir, 'run-manifest.ndjson');
    commit(w, `run ${date}`, `${date}T12:00:00Z`);
  }

  define(/^its Examples rows fell from 5 to 3 in a commit dated "([^"]+)"$/, (w, date) => {
    w.outlineRows = 3;
    writeOutline(w);
    commit(w, 'rows shed', `${date}T10:00:00Z`);
    recordOutlineRun(w, '2026-08-05');
  });

  define(/^a dilution sighting carries the row count series 5, 3$/, (w) => {
    const hit = findSignal(w, w.title, 'assertion decline');
    assert.deepStrictEqual(hit.evidence.series, [5, 3]);
    assert.strictEqual(hit.evidence.kind, 'examples rows');
  });

  define(/^the reviewed scenario "([^"]+)" deleted with no journal discussion in its change interval$/,
    async (w, title) => {
      await baseWorld(w, title);
      recordRun(w, {}, '2026-07-31');
      w.specs = [{ title: 'Charge a card', thens: 1, flavor: 'card' }];
      writeFeature(w);
      recordRun(w, {}, '2026-08-04');
    });

  define(/^the sighting records that a reviewed scenario left the corpus$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the removed scenario');
    assert.strictEqual(item.evidence.statement, 'reviewed intent removed');
    w.removalItem = item;
  });

  define(/^the sighting ranks at the quiet-removal tier$/, (w) => {
    assert.strictEqual(w.removalItem.tier, 'quiet-removal');
  });

  define(/^the reviewed scenario "([^"]+)" retitled to "([^"]+)" in the commit that dropped one of its Then steps$/,
    async (w, from, to) => {
      await baseWorld(w, from, { thens: 3 });
      recordRun(w, {}, '2026-07-31');
      w.title = to;
      w.specs = [{ title: to, thens: 2 }];
      writeFeature(w);
      commit(w, 'retitle and shed', '2026-08-03T10:00:00Z');
      recordRun(w, {}, '2026-08-04');
      w.formerTitle = from;
    });

  define(/^the retitle is confirmed by the identity thread$/, async (w) => {
    // The bytes cannot confirm a retitle-with-edit; the user's journal
    // ruling heals the thread (surviving-renames contract).
    await W.addJournalEntries(w, [{
      content: `Ruling: the scenario "${w.formerTitle}" was renamed to "${w.title}" — same scenario, confirmed.`,
      role: 'user',
      sessionId: 'review-session',
      createdAt: W.toUnix('2026-08-03T11:00:00Z'),
    }]);
  });

  define(/^the dilution sighting carries the assertion count series across both titles$/,
    (w) => {
      const hit = findSignal(w, w.title, 'assertion decline');
      assert.deepStrictEqual(hit.evidence.series, [3, 2],
        'the series does not span the retitle');
    });

  define(/^the sighting cites the identity thread$/, (w) => {
    const node = findScenario(w, w.title);
    const formers = /** @type {Array<{title: string}>} */ (node.data.formerTitles ?? []);
    assert.ok(formers.some((f) => f.title === w.formerTitle),
      'the scenario does not carry its former title');
  });

  // --- absorbed edit tiers -------------------------------------------------

  define(/^the reviewed scenario "([^"]+)" changed with no journal discussion in its change interval$/,
    async (w, title) => {
      await baseWorld(w, title);
      w.specs[0].reword = 'promptly';
      writeFeature(w);
      commit(w, 'quiet change', '2026-08-03T10:00:00Z');
    });

  define(/^the quiet edit is flagged as changed without traced discussion$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the scenario');
    assert.strictEqual(item.tier, 'quiet-edit');
    const all = [{ signal: '', evidence: item.evidence }, ...item.absorbed];
    assert.ok(item.tier === 'quiet-edit' && all.length > 0, 'quiet edit not flagged');
  });

  define(/^the reviewed scenario "([^"]+)" changed with journal discussion of the change$/,
    async (w, title) => {
      await baseWorld(w, title);
      w.specs[0].reword = 'promptly';
      writeFeature(w);
      commit(w, 'declared change', '2026-08-03T10:00:00Z');
      await W.addJournalEntries(w, [{
        content: `We reworked "${title}" today — steps now settle promptly.`,
        role: 'user',
        sessionId: 'review-session',
        createdAt: W.toUnix('2026-08-03T09:30:00Z'),
      }]);
    });

  define(/^the declared edit is listed with pointers to its discussion$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the scenario');
    assert.strictEqual(item.tier, 'declared-edit');
    const change = /** @type {{change?: {discussion: unknown[]}}} */ (item.evidence);
    assert.ok((change.change?.discussion ?? []).length > 0,
      'declared edit carries no discussion pointers');
  });

  // --- the ladder ----------------------------------------------------------

  define(/^a picture with a fence breach, a sanction violation, and a possible breach$/,
    async (w) => {
      W.gitInit(w);
      w.featureFile = 'features/mixed.feature';
      w.specs = [
        { title: 'Refund half of an order', thens: 1, breachy: true },
        { title: 'Retry webhook delivery', thens: 2 },
        { title: 'Adjust an invoice after the order ships', thens: 1, arguable: true },
      ];
      const lines = ['Feature: Mixed',
        '  Scenario: Refund half of an order',
        '    Given a paid order',
        '    When half of the order amount is refunded',
        '    Then the partial refund is declined',
        '  Scenario: Retry webhook delivery',
        '    Given a paid order',
        '    When the refund is requested',
        '    Then the refund settles',
        '    And check 1 holds',
        '  Scenario: Adjust an invoice after the order ships',
        '    Given a shipped order',
        '    When the invoice is adjusted after shipping',
        '    Then the adjusted amount replaces the original'];
      W.writeFile(w, w.featureFile, lines.join('\n') + '\n');
      const fence = ['# Out of scope', '', '## Declined', '',
        '- **Partial refunds** — refunding half of an order is declined. (2026-07-01)',
        '- **Invoice adjustment after delivery** — adjusting an invoice once',
        '  the order has shipped is declined territory. (2026-07-01)', '',
        '## Sanctioned changes', '',
        '- **features/mixed.feature** / "Retry webhook delivery" — direction: **drops**. (2026-07-25)', ''];
      W.writeFile(w, 'OUT-OF-SCOPE.md', fence.join('\n'));
      commit(w, 'corpus', '2026-07-20T10:00:00Z');
      // the out-of-direction edit: a reword under a drops-only sanction
      const reworded = lines.map((l) => (l === '    Then the refund settles'
        ? '    Then the refund settles promptly' : l));
      W.writeFile(w, w.featureFile, reworded.join('\n') + '\n');
      commit(w, 'reword under drops sanction', '2026-08-02T10:00:00Z');
    });

  define(/^the fence breach ranks first, the sanction violation second, and the possible breach third$/,
    (w) => {
      const idxOf = (/** @type {string} */ tier) =>
        w.list.items.findIndex((/** @type {{tier: string}} */ i) => i.tier === tier);
      const breach = idxOf('breach');
      const violation = idxOf('sanction-violation');
      const possible = idxOf('possible-breach');
      assert.ok(breach !== -1 && violation !== -1 && possible !== -1,
        `all three present: ${JSON.stringify(w.list.items.map((/** @type {{tier: string}} */ i) => i.tier))}`);
      assert.ok(breach < violation && violation < possible,
        `order breach=${breach} violation=${violation} possible=${possible}`);
    });

  define(/^a picture with a quiet removal, a verdict-coupled edit, an assertion decline, a quiet edit, and a declared edit$/,
    async (w) => {
      W.gitInit(w);
      w.featureFile = 'features/ladder.feature';
      w.specs = [
        { title: 'Removed intent', thens: 2, flavor: 'card' },
        { title: 'Coupled edit', thens: 2 },
        { title: 'Shedding intent', thens: 3 },
        { title: 'Quiet intent', thens: 2 },
        { title: 'Declared intent', thens: 2 },
      ];
      writeFeature(w);
      writeFence(w, [], '');
      commit(w, 'corpus', '2026-07-20T10:00:00Z');
      await W.createJournalStore(w, w.specs.map((/** @type {{title: string}} */ s, /** @type {number} */ i) => ({
        content: `Ruling: "${s.title}" is approved as specified.`,
        role: 'user',
        sessionId: 'review-session',
        createdAt: W.toUnix('2026-07-20T11:00:00Z') + i * 60,
      })));
      recordRun(w, { 'Coupled edit': 'failed' }, '2026-07-31');
      // edits: coupled reword in the red span; shed one Then; quiet reword; declared reword
      w.specs[1].reword = 'promptly';
      w.specs[2].thens = 2;
      w.specs[3].reword = 'cleanly';
      w.specs[4].reword = 'firmly';
      writeFeature(w);
      commit(w, 'edits', '2026-08-02T10:00:00Z');
      await W.addJournalEntries(w, [{
        content: 'We reworked "Declared intent" today — steps now settle firmly.',
        role: 'user',
        sessionId: 'review-session',
        createdAt: W.toUnix('2026-08-02T09:30:00Z'),
      }]);
      // the removal: drop the reviewed scenario and its row
      w.specs = w.specs.filter((/** @type {{title: string}} */ s) => s.title !== 'Removed intent');
      writeFeature(w);
      recordRun(w, {}, '2026-08-04');
    });

  define(/^the quiet removal ranks first and the verdict-coupled edit second$/, (w) => {
    w.idxOf = (/** @type {string} */ title) =>
      w.list.items.findIndex((/** @type {{title?: string}} */ i) => i.title === title);
    assert.ok(w.idxOf('Removed intent') !== -1, 'removal missing from the list');
    assert.strictEqual(w.list.items[w.idxOf('Removed intent')].tier, 'quiet-removal');
    assert.strictEqual(w.list.items[w.idxOf('Coupled edit')].tier, 'verdict-coupled');
    assert.ok(w.idxOf('Removed intent') < w.idxOf('Coupled edit'), 'removal does not outrank');
  });

  define(/^the assertion decline ranks third, the quiet edit fourth, and the declared edit fifth$/,
    (w) => {
      assert.strictEqual(w.list.items[w.idxOf('Shedding intent')].tier, 'assertion-decline');
      assert.strictEqual(w.list.items[w.idxOf('Quiet intent')].tier, 'quiet-edit');
      assert.strictEqual(w.list.items[w.idxOf('Declared intent')].tier, 'declared-edit');
      assert.ok(w.idxOf('Coupled edit') < w.idxOf('Shedding intent'), 'coupled above decline');
      assert.ok(w.idxOf('Shedding intent') < w.idxOf('Quiet intent'), 'decline above quiet');
      assert.ok(w.idxOf('Quiet intent') < w.idxOf('Declared intent'), 'quiet above declared');
    });

  define(/^a picture with a declared edit and a never-run scenario$/, async (w) => {
    W.gitInit(w);
    w.featureFile = 'features/pair.feature';
    w.specs = [
      { title: 'Declared intent', thens: 2 },
      { title: 'Never-run intent', thens: 1 },
    ];
    writeFeature(w);
    writeFence(w, [], '');
    commit(w, 'corpus', '2026-07-20T10:00:00Z');
    await W.createJournalStore(w, [{
      content: 'Ruling: "Declared intent" is approved as specified.',
      role: 'user',
      sessionId: 'review-session',
      createdAt: W.toUnix('2026-07-20T11:00:00Z'),
    }]);
    recordRun(w, {}, '2026-07-31', { omit: ['Never-run intent'] });
    w.specs[0].reword = 'firmly';
    writeFeature(w);
    commit(w, 'declared change', '2026-08-02T10:00:00Z');
    await W.addJournalEntries(w, [{
      content: 'We reworked "Declared intent" today — settles firmly now.',
      role: 'user',
      sessionId: 'review-session',
      createdAt: W.toUnix('2026-08-02T09:30:00Z'),
    }]);
  });

  define(/^the declared edit ranks above the never-run scenario$/, (w) => {
    const idxOf = (/** @type {string} */ title) =>
      w.list.items.findIndex((/** @type {{title?: string}} */ i) => i.title === title);
    const d = idxOf('Declared intent');
    const n = idxOf('Never-run intent');
    assert.ok(d !== -1 && n !== -1, 'both items must be present');
    assert.strictEqual(w.list.items[d].tier, 'declared-edit');
    assert.strictEqual(w.list.items[n].tier, 'never-run');
    assert.ok(d < n, `declared=${d} never-run=${n}`);
  });

  define(/^a picture with a contested region and a spent-sanction confirmation$/,
    async (w) => {
      await baseWorld(w, 'Sanctioned intent', { ruling: false });
      writeFence(w, [{ title: 'Sanctioned intent', directions: 'direction: **rewords**', date: '2026-07-25' }],
        '2026-07-25');
      w.specs[0].reword = 'promptly';
      writeFeature(w);
      commit(w, 'sanctioned reword', '2026-08-02T10:00:00Z');
      recordRun(w, {}, '2026-08-03');
      // contested: heavy user discussion of another scenario, outliving its
      // last spec change — plus quiet ambient sessions for the natural break
      const talk = Array.from({ length: 25 }, (_, i) => ({
        content: `Round ${i}: "Sanctioned intent" keeps coming back up, unresolved.`,
        role: 'user',
        sessionId: 'hot-talk',
        createdAt: W.toUnix('2026-08-05T09:00:00Z') + i * 60,
      }));
      const bg = Array.from({ length: 3 }, (_, i) => ({
        content: `Ambient note ${i} about the deploy pipeline.`,
        role: 'user',
        sessionId: 'bg-one',
        createdAt: W.toUnix('2026-08-01T09:00:00Z') + i * 60,
      }));
      const bg2 = Array.from({ length: 2 }, (_, i) => ({
        content: `Ambient note ${i} about release dates and the changelog.`,
        role: 'user',
        sessionId: 'bg-two',
        createdAt: W.toUnix('2026-08-01T11:00:00Z') + i * 60,
      }));
      await W.createJournalStore(w, [...talk, ...bg, ...bg2]);
    });

  define(/^the contested region ranks above the confirmation$/, (w) => {
    const contested = w.list.items.findIndex(
      (/** @type {{tier: string}} */ i) => i.tier === 'contested');
    const confirmation = w.list.items.findIndex(
      (/** @type {{tier: string}} */ i) => i.tier === 'confirmation');
    assert.ok(contested !== -1, `no contested item: ${
      JSON.stringify(w.list.items.map((/** @type {{tier: string}} */ i) => i.tier))}`);
    assert.ok(confirmation !== -1, 'no confirmation item');
    assert.ok(contested < confirmation, `contested=${contested} confirmation=${confirmation}`);
  });

  // --- sanctions -----------------------------------------------------------

  define(/^the fence sanctions a change to "([^"]+)" with direction "([^"]+)" in an entry dated "([^"]+)"$/,
    async (w, title, direction, date) => {
      if (w.title !== title) await baseWorld(w, title, { ruling: false });
      writeFence(w, [{ title, directions: `direction: **${direction}**`, date }], date);
      w.entryDate = date;
    });

  define(/^a commit dated "([^"]+)" reworded its Then steps$/, (w, date) => {
    w.specs[0].reword = 'promptly';
    writeFeature(w);
    w.editHash = commit(w, 'reword', `${date}T10:00:00Z`);
  });

  define(/^the next recorded run shows it passing$/, (w) => {
    recordRun(w, {}, '2026-08-05');
    w.greenDate = '2026-08-05';
  });

  define(/^a confirmation states the sanctioned change landed as ruled$/, (w) => {
    const hit = findSignal(w, w.title, 'sanction confirmation');
    assert.strictEqual(hit.evidence.statement, 'sanctioned change landed as ruled');
    w.confirmation = hit;
  });

  define(/^the confirmation cites the entry and the commit dated "([^"]+)"$/, (w, date) => {
    assert.strictEqual(w.confirmation.evidence.entryDate, w.entryDate);
    assert.strictEqual(w.confirmation.evidence.commit, w.commitByDate[date]);
  });

  define(/^the sanction is spent$/, (w) => {
    const node = findScenario(w, w.title);
    const tl = /** @type {Array<{event: string}>} */ (node.data.dilutionTimeline ?? []);
    assert.ok(tl.some((e) => e.event === 'sanction-spent'), 'no sanction-spent event');
  });

  define(/^the fence entry dated "([^"]+)" sanctioning rewords to "([^"]+)" was spent at a green dated "([^"]+)"$/,
    async (w, entryDate, title, greenDate) => {
      await baseWorld(w, title, { ruling: false });
      writeFence(w, [{ title, directions: 'direction: **rewords**', date: entryDate }], entryDate);
      w.specs[0].reword = 'promptly';
      writeFeature(w);
      commit(w, 'sanctioned reword', '2026-08-04T10:00:00Z');
      recordRun(w, {}, greenDate);
      w.entryDate = entryDate;
    });

  define(/^a commit dated "([^"]+)" reworded its Then steps again with no journal discussion in the change interval$/,
    (w, date) => {
      w.specs[0].reword = 'promptly and cleanly';
      writeFeature(w);
      w.editHash = commit(w, 'second reword', `${date}T10:00:00Z`);
    });

  define(/^the later edit is sighted at the quiet-edit tier$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the scenario');
    assert.strictEqual(item.tier, 'quiet-edit');
  });

  define(/^no confirmation fires for it$/, (w) => {
    const node = findScenario(w, w.title);
    const signals = /** @type {Array<{signal: string, evidence: {commit?: string}}>} */ (
      node.data.dilution?.signals ?? []);
    assert.ok(!signals.some((s) => s.signal === 'sanction confirmation'
      && s.evidence.commit === w.editHash),
      'a confirmation fired for the unsanctioned later edit');
  });

  define(/^a confirmation whose spending green dated "([^"]+)" was followed by a recorded run dated "([^"]+)"$/,
    async (w, greenDate, laterDate) => {
      await baseWorld(w, 'Sanctioned intent', { ruling: false });
      w.specs.push({ title: 'Charge a card', thens: 1, flavor: 'card' });
      writeFeature(w);
      writeFence(w, [{ title: w.title, directions: 'direction: **rewords**', date: '2026-07-25' }],
        '2026-07-25');
      w.specs[0].reword = 'promptly';
      writeFeature(w);
      commit(w, 'sanctioned reword', '2026-08-02T10:00:00Z');
      recordRun(w, {}, greenDate);
      // the later run's content differs (a bystander flip), so the run is
      // a real manifest commit — identical bytes record no run.
      recordRun(w, { 'Charge a card': 'failed' }, laterDate);
    });

  define(/^the confirmation no longer appears$/, (w) => {
    const list = attention(w);
    assert.ok(!list.items.some((/** @type {{title?: string, tier: string}} */ i) =>
      i.title === w.title && i.tier === 'confirmation'),
      'the confirmation outlived its next recorded verdict');
  });

  define(/^the timeline for its scenario still records the consumed sanction$/, (w) => {
    const node = findScenario(w, w.title);
    const tl = /** @type {Array<{event: string}>} */ (node.data.dilutionTimeline ?? []);
    assert.ok(tl.some((e) => e.event === 'sanction-spent'),
      'the timeline lost the consumption record');
  });

  define(/^a commit dated "([^"]+)" reworded its Then steps without dropping any$/,
    (w, date) => {
      w.specs[0].reword = 'promptly';
      writeFeature(w);
      w.editHash = commit(w, 'out-of-direction reword', `${date}T10:00:00Z`);
    });

  define(/^the edit is sighted as a sanction violation citing the entry's direction$/, (w) => {
    const hit = findSignal(w, w.title, 'sanction violation');
    const sanctions = /** @type {Array<{directions: string[]}>} */ (hit.evidence.sanctions);
    assert.ok(sanctions.some((s) => s.directions.includes('drops')),
      'the violation does not cite the live entry\'s direction');
  });

  define(/^the sanction is not spent$/, (w) => {
    const node = findScenario(w, w.title);
    const tl = /** @type {Array<{event: string}>} */ (node.data.dilutionTimeline ?? []);
    assert.ok(!tl.some((e) => e.event === 'sanction-spent'),
      'the violation spent the sanction — collateral expiry is ruled out');
  });

  define(/^the fence sanctions changes to "([^"]+)" with direction "drops" in an entry dated "([^"]+)" and direction "rewords" in an entry dated "([^"]+)"$/,
    async (w, title, d1, d2) => {
      await baseWorld(w, title, { ruling: false });
      writeFence(w, [
        { title, directions: 'direction: **drops**', date: d1 },
        { title, directions: 'direction: **rewords**', date: d2 },
      ], d2);
      w.rewordsDate = d2;
    });

  define(/^a confirmation fires for the rewords entry$/, (w) => {
    const hit = findSignal(w, w.title, 'sanction confirmation');
    assert.strictEqual(hit.evidence.entryDate, w.rewordsDate,
      'the confirmation cites the wrong entry');
    assert.deepStrictEqual(hit.evidence.directions, ['rewords']);
  });

  define(/^the drops entry stays live$/, (w) => {
    const node = findScenario(w, w.title);
    const tl = /** @type {Array<{event: string}>} */ (node.data.dilutionTimeline ?? []);
    assert.strictEqual(tl.filter((e) => e.event === 'sanction-spent').length, 1,
      'more than one entry was spent');
  });

  define(/^no sanction violation fires$/, (w) => {
    const node = findScenario(w, w.title);
    const signals = node.data.dilution?.signals ?? [];
    assert.ok(!signals.some((/** @type {{signal: string}} */ s) => s.signal === 'sanction violation'),
      'a covered edit fired a violation');
  });

  define(/^the fence sanctions a change to "([^"]+)" in an entry dated "([^"]+)" naming no direction$/,
    async (w, title, date) => {
      await baseWorld(w, title);
      writeFence(w, [{ title, directions: 'what changes: the steps are revised', date }], date);
    });

  define(/^the entry is reported malformed for naming no direction$/, (w) => {
    assert.ok(w.result.notes.some((/** @type {string} */ n) =>
      n.includes('names no direction') && n.includes(w.title)),
      'no malformed-entry note');
  });

  define(/^the edit is sighted as if no sanction existed$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the scenario');
    assert.strictEqual(item.tier, 'quiet-edit');
    const node = findScenario(w, w.title);
    const signals = node.data.dilution?.signals ?? [];
    assert.ok(!signals.some((/** @type {{signal: string}} */ s) =>
      s.signal === 'sanction violation' || s.signal === 'sanction confirmation'),
      'a malformed entry participated in judgment');
  });

  define(/^no edit touched the scenario since "([^"]+)"$/, (w, date) => {
    assert.ok(w.entryDate === date, 'fixture mismatch: entry date');
  });

  define(/^recorded runs dated "([^"]+)" and "([^"]+)" show it passing$/, (w, d1, d2) => {
    recordRun(w, {}, d1);
    recordRun(w, {}, d2);
  });

  define(/^a low-tier item states the sanction is unconsumed$/, (w) => {
    const item = itemOf(w, w.title);
    assert.ok(item, 'no attention item for the scenario');
    assert.strictEqual(item.tier, 'confirmation');
    const texts = JSON.stringify([item.evidence, ...item.absorbed.map(
      (/** @type {{evidence: unknown}} */ a) => a.evidence)]);
    assert.ok(texts.includes('unconsumed'), 'the item does not state unconsumed');
  });

  define(/^the item appears at every refresh while the entry stands$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const item = itemOf(w, w.title);
    assert.ok(item !== undefined && item.tier === 'confirmation',
      'the standing notice vanished on a further refresh');
  });

  define(/^an unconsumed-sanction notice standing for an entry dated "([^"]+)"$/,
    async (w, date) => {
      await baseWorld(w, 'Sanctioned intent', { ruling: false });
      writeFence(w, [{ title: w.title, directions: 'direction: **drops**', date }], date);
      recordRun(w, {}, '2026-08-04');
      w.entryDate = date;
    });

  define(/^the entry was deleted from the fence on "([^"]+)"$/, (w, date) => {
    writeFence(w, [], '');
    commit(w, 'entry retired', `${date}T10:00:00Z`);
  });

  define(/^no unconsumed-sanction item appears$/, (w) => {
    const list = attention(w);
    assert.ok(!list.items.some((/** @type {{title?: string, tier: string}} */ i) =>
      i.title === w.title && i.tier === 'confirmation'),
      'the notice outlived its entry');
  });

  define(/^the timeline records the entry and its removal$/, (w) => {
    const node = findScenario(w, w.title);
    const tl = /** @type {Array<{event: string, removed?: boolean}>} */ (
      node.data.dilutionTimeline ?? []);
    assert.ok(tl.some((e) => e.event === 'sanction-entry' && e.removed === true),
      'the removed entry left no timeline trace');
  });

  define(/^the scenario was deleted in a commit dated "([^"]+)"$/, (w, date) => {
    w.deletedTitle = w.title;
    w.specs = [{ title: 'Charge a card', thens: 1, flavor: 'card' }];
    writeFeature(w);
    commit(w, 'sanctioned deletion', `${date}T10:00:00Z`);
  });

  define(/^a confirmation states the sanctioned deletion landed as ruled$/, (w) => {
    const list = attention(w);
    const item = list.items.find((/** @type {{title?: string}} */ i) => i.title === w.deletedTitle);
    assert.ok(item, 'no item for the sanctioned deletion');
    assert.strictEqual(item.tier, 'confirmation');
    assert.strictEqual(item.evidence.statement, 'sanctioned deletion landed as ruled');
  });

  define(/^no quiet-removal sighting fires$/, (w) => {
    const list = attention(w);
    assert.ok(!list.items.some((/** @type {{title?: string, tier: string}} */ i) =>
      i.title === w.deletedTitle && i.tier === 'quiet-removal'),
      'a sanctioned deletion read as a quiet removal');
  });

  define(/^a confirmation for a sanctioned deletion observed at the refresh dated "([^"]+)"$/,
    async (w, _date) => {
      await baseWorld(w, 'Sanctioned intent', { ruling: false });
      writeFence(w, [{ title: w.title, directions: 'direction: **deletes-scenario**', date: '2026-08-02' }],
        '2026-08-02');
      recordRun(w, {}, '2026-08-03');
      w.deletedTitle = w.title;
      w.specs = [{ title: 'Charge a card', thens: 1, flavor: 'card' }];
      writeFeature(w);
      commit(w, 'sanctioned deletion', '2026-08-04T10:00:00Z');
    });

  define(/^a recorded run dated "([^"]+)" over the corpus$/, (w, date) => {
    recordRun(w, {}, date);
  });

  define(/^the deletion confirmation no longer appears$/, (w) => {
    assert.ok(!w.list.items.some((/** @type {{title?: string, tier: string}} */ i) =>
      i.title === w.deletedTitle && i.tier === 'confirmation'),
      'the deletion confirmation outlived the corpus\'s next recorded run');
  });

  define(/^the scenario "([^"]+)" with no ruling evidence in the journal$/,
    async (w, title) => {
      await baseWorld(w, title, { ruling: false });
      await W.createJournalStore(w, [{
        content: 'Ambient note about the deploy pipeline, naming nothing.',
        role: 'user',
        sessionId: 'bg-one',
        createdAt: W.toUnix('2026-07-21T09:00:00Z'),
      }]);
    });

  define(/^the fence sanctions a change to it with direction "rewords" in an entry dated "([^"]+)"$/,
    (w, date) => {
      writeFence(w, [{ title: w.title, directions: 'direction: **rewords**', date }], date);
      w.entryDate = date;
    });

  define(/^"([^"]+)" is marked reviewed$/, (w, title) => {
    const node = findScenario(w, title);
    assert.strictEqual(node.data.review?.status, 'reviewed');
  });

  define(/^the reviewed mark carries a pointer to the sanctioning entry$/, (w) => {
    const node = findScenario(w, w.title);
    const ruling = node.data.review?.ruling;
    assert.ok(ruling, 'the reviewed mark carries no ruling');
    assert.ok(String(ruling.tcNodeId).startsWith('sanction:'),
      `the pointer does not cite the sanctioning entry: ${JSON.stringify(ruling)}`);
  });

  // --- the timeline query --------------------------------------------------

  define(/^a picture with a dilution sighting for "([^"]+)"$/, async (w, title) => {
    await baseWorld(w, title);
    recordRun(w, { [title]: 'failed' }, '2026-08-02');
    w.specs[0].reword = 'promptly';
    writeFeature(w);
    commit(w, 'reword', '2026-08-03T10:00:00Z');
    recordRun(w, {}, '2026-08-04');
  });

  define(/^the fence sanctions changes to it with directions "drops and rewords" in one entry dated "([^"]+)"$/,
    (w, date) => {
      // Dated after the edit: dormant for the sighting, visible in the
      // timeline — the multi-direction example lives here, not in the
      // violation scenario (drafting note, probe amendment).
      writeFence(w, [{ title: w.title, directions: 'directions: **drops** and **rewords**', date }],
        date);
    });

  define(/^the answer lists its edits, verdicts, count series, and sanction entries in dated order$/,
    (w) => {
      assert.ok(w.answer, `expected an answer, got refusal: ${w.refusal}`);
      const tl = /** @type {Array<{at: string, event: string, directions?: string[]}>} */ (
        w.answer.timeline);
      const kinds = new Set(tl.map((e) => e.event));
      for (const need of ['changed', 'verdict', 'mass', 'sanction-entry']) {
        assert.ok(kinds.has(need), `timeline lacks ${need} events: ${JSON.stringify([...kinds])}`);
      }
      const dated = tl.filter((e) => e.at !== '');
      for (let i = 1; i < dated.length; i++) {
        assert.ok(dated[i - 1].at <= dated[i].at, 'timeline is not in dated order');
      }
      const entry = tl.find((e) => e.event === 'sanction-entry');
      assert.deepStrictEqual(entry?.directions, ['drops', 'rewords'],
        'the compound entry does not carry both directions');
    });

  define(/^the sighting's evidence appears at its dated place$/, (w) => {
    const sightings = /** @type {Array<{signal: string, evidence: {commit?: string}}>} */ (
      w.answer.sightings);
    assert.ok(sightings.some((s) => s.signal === 'verdict-coupled edit'),
      'the sighting is missing from the answer');
  });

  define(/^the reviewed scenario "([^"]+)" with no dilution sightings$/,
    async (w, title) => {
      await baseWorld(w, title);
      recordRun(w, {}, '2026-07-31');
    });

  define(/^the answer lists its edits, verdicts, and count series in dated order$/, (w) => {
    assert.ok(w.answer, `expected an answer, got refusal: ${w.refusal}`);
    const tl = /** @type {Array<{event: string}>} */ (w.answer.timeline);
    assert.ok(tl.length > 0, 'a clean scenario received an empty timeline');
    assert.ok(tl.some((e) => e.event === 'verdict') && tl.some((e) => e.event === 'mass'),
      'the clean timeline lacks its history');
    assert.deepStrictEqual(w.answer.sightings, []);
  });

  define(/^no health verdict is stated$/, (w) => {
    const keys = Object.keys(w.answer).sort();
    assert.deepStrictEqual(keys,
      ['file', 'refreshedAt', 'sightings', 'sourcesChanged', 'timeline', 'title'],
      'the answer carries fields beyond the history — a verdict has no place here');
  });

  define(/^a picture whose corpus has no scenario titled "([^"]+)"$/, async (w, title) => {
    await baseWorld(w, 'Refund a cancelled order');
    assert.notStrictEqual(w.title, title);
  });

  define(/^the answer is a refusal naming the unmatched title$/, (w) => {
    assert.ok(w.refusal, 'expected a refusal, got an answer');
    assert.ok(w.refusal.includes('Refund a canceled order'),
      `the refusal does not name the title: ${w.refusal}`);
  });

  define(/^nearest-title candidates are offered as evidence$/, (w) => {
    assert.ok(w.refusal.includes('"Refund a cancelled order"'),
      `no near-title candidate offered: ${w.refusal}`);
  });

  // --- degraded sources ----------------------------------------------------

  define(/^a project with feature files, binding status, and a journal but no commit history$/,
    async (w) => {
      W.project(w);
      W.writeManifest(w);
      await W.writeJournal(w);
    });

  define(/^the report names change history as absent$/, (w) => {
    assert.ok(w.result.absent.includes('change history'),
      `absent: ${JSON.stringify(w.result.absent)}`);
  });

  define(/^the report names dilution signals as dark$/, (w) => {
    assert.ok(w.result.dark.includes('dilution signals'),
      `dark: ${JSON.stringify(w.result.dark)}`);
  });

  define(/^commit history readable only after "(?:[^"]+)"$/, (w) => {
    // Built in the following step: the world needs its full history first,
    // then a shallow clone truncates it.
    w.wantShallow = true;
  });

  define(/^the reviewed scenario "([^"]+)" whose failing span began before "([^"]+)" and ended green after it$/,
    async (w, title, _boundary) => {
      await baseWorld(w, title, { initDate: '2026-07-25' });
      recordRun(w, {}, '2026-07-28');
      w.specs[0].reword = 'promptly';
      writeFeature(w);
      commit(w, 'reword', '2026-07-30T10:00:00Z');
      recordRun(w, { [title]: 'failed' }, '2026-08-04');
      recordRun(w, {}, '2026-08-06');
      // shallow-clone to depth 2: the failing run and the green that ends
      // the span are readable; the span's start is beyond the boundary.
      const clone = path.join(w.dir, '..', `${path.basename(w.dir)}-shallow`);
      execFileSync('git', ['clone', '--depth', '3',
        `file://${w.dir}`, clone], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      w.fullDir = w.dir;
      w.dir = clone;
      w.manifestPath = path.join(clone, 'run-manifest.ndjson');
    });

  define(/^the report states the span's order could not be established$/, (w) => {
    assert.ok(w.result.notes.some((/** @type {string} */ n) =>
      n.includes('could not be established') && n.includes(w.title)),
      `no order note: ${JSON.stringify(w.result.notes)}`);
  });

  define(/^no dilution sighting is manufactured$/, (w) => {
    const node = findScenario(w, w.title);
    const signals = node.data.dilution?.signals ?? [];
    assert.deepStrictEqual(signals.map((/** @type {{signal: string}} */ s) => s.signal), [],
      'a sighting was manufactured across the truncation boundary');
  });
};
