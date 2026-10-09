'use strict';
const assert = require('node:assert');
const gt = require('../../index');
const W = require('../world');

// Saturation worlds write >500 journal entries naming the target titles, so
// each title's provenance query genuinely hits the mining bound — no mocks.
// Saturated and quiet titles share no vocabulary: only the named titles'
// queries can match the chatter.
const OVER_BOUND = 510;

/** @param {string} feature @param {string[]} titles */
function featureOf(feature, titles) {
  return [
    `Feature: ${feature}`,
    ...titles.flatMap((t) => [
      `  Scenario: ${t}`,
      `    Given the world behind "${t}"`,
      '    Then it behaves as declared',
    ]),
    '',
  ].join('\n');
}

/**
 * @param {string[]} mentioned titles every entry names
 * @returns {Array<{content: string, createdAt: number}>}
 */
function saturatingEntries(mentioned) {
  const quoted = mentioned.map((t) => `"${t}"`).join(' plus ');
  return Array.from({ length: OVER_BOUND }, (_, i) => ({
    content: `Chatter item r${i} naming ${quoted} again.`,
    createdAt: 1753000000 + i * 60,
  }));
}

/** An outline missing its examples — a genuine gnt parse failure. */
const BROKEN_OUTLINE = [
  '  Scenario Outline: an outline missing its examples',
  '    Given a step with <placeholder>',
  '',
].join('\n');

/** @param {Record<string, any>} w @param {number} saturatedCount */
async function saturationWorld(w, saturatedCount) {
  W.project(w);
  w.saturated = Array.from({ length: saturatedCount },
    (_, i) => `Corridor blockade s${i + 1} drains fully`);
  w.quiet = Array.from({ length: 8 - saturatedCount },
    (_, i) => `Nightly ledger rollup n${i + 1} reconciles`);
  W.writeFile(w, 'features/corridors.feature', featureOf('Corridors', w.saturated));
  if (w.quiet.length > 0) {
    W.writeFile(w, 'features/ledgers.feature', featureOf('Ledgers', w.quiet));
  }
  await W.createJournalStore(w, saturatingEntries(w.saturated));
}

/** @param {Record<string, any>} w */
function saturationConditions(w) {
  return w.result.conditions.filter(
    (/** @type {{kind: string}} */ c) => c.kind === 'provenance-saturation');
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  // --- givens ---------------------------------------------------------------

  define(/^a corpus of 8 scenarios whose every title saturates provenance mining$/,
    async (w) => {
      await saturationWorld(w, 8);
      w.titles = w.saturated;
    });

  define(/^a corpus where (\d) of 8 scenario titles saturate provenance mining$/,
    async (w, n) => {
      await saturationWorld(w, Number(n));
    });

  define(/^12 feature files of which 9 fail to parse for 2 distinct reasons$/, (w) => {
    W.project(w);
    for (const name of ['amber', 'bronze', 'copper']) {
      W.writeFile(w, `features/good-${name}.feature`,
        featureOf(`Good ${name} area`, [`Good ${name} outcome settles cleanly`]));
    }
    // Alphabetic file names on purpose: the cause classes must merge because
    // the parser's path prefix is stripped, never because file names happen
    // to differ only by a digit (adversarial catch).
    for (const name of ['alpha', 'beta', 'gamma', 'delta', 'epsilon']) {
      W.writeFile(w, `features/outline-${name}.feature`,
        `Feature: Outline ${name} area\n${BROKEN_OUTLINE}`);
    }
    for (const name of ['red', 'blue', 'green', 'gold']) {
      W.writeFile(w, `features/dup-${name}.feature`, [
        `Feature: Duplicated ${name} area`,
        `  Scenario: Twice-told tale of ${name}`,
        '    Given a first telling',
        `  Scenario: Twice-told tale of ${name}`,
        '    Given a second telling',
        '',
      ].join('\n'));
    }
  });

  define(/^12 feature files of which 3 fail to parse$/, (w) => {
    W.project(w);
    for (const name of ['amber', 'bronze', 'copper', 'dune', 'ember', 'fern', 'grove', 'heath', 'iris']) {
      W.writeFile(w, `features/good-${name}.feature`,
        featureOf(`Good ${name} area`, [`Good ${name} outcome settles cleanly`]));
    }
    for (const name of ['alpha', 'beta', 'gamma']) {
      W.writeFile(w, `features/outline-${name}.feature`,
        `Feature: Outline ${name} area\n${BROKEN_OUTLINE}`);
    }
  });

  define(
    /^a corpus of 40 declared-intent scenarios with no design tier, one of them never run$/,
    async (w) => {
      W.writeFeatures(w, 4, 40);
      w.neverRun = w.scenarios[0].title;
      W.writeManifest(w, { omit: [w.neverRun] });
      await W.runRefresh(w);
      assert.ok(w.result, `refresh failed: ${w.error}`);
    });

  define(/^a corpus whose only design feature file fails to parse$/, async (w) => {
    W.project(w);
    w.unrefined = ['Retry a stalled webhook delivery', 'Archive a settled dispute'];
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', w.unrefined));
    W.writeFile(w, 'features/design/orders.feature',
      `Feature: Order mechanics\n${BROKEN_OUTLINE}`);
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^a corpus with a design tier where 3 declared-intent scenarios are unrefined$/,
    async (w) => {
      W.project(w);
      w.unrefined = [
        'Retry a stalled webhook delivery',
        'Archive a settled dispute',
        'Escalate a frozen payout',
      ];
      W.writeFile(w, 'features/orders.feature',
        featureOf('Orders', ['Refund a cancelled order cleanly', ...w.unrefined]));
      W.writeFile(w, 'features/design/orders.feature',
        featureOf('Order mechanics', ['Refund a cancelled order cleanly via ledger reversal']));
      await W.runRefresh(w);
      assert.ok(w.result, `refresh failed: ${w.error}`);
    });

  // --- whens ----------------------------------------------------------------

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^a refresh runs twice$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.firstConditions = w.result.conditions;
    w.clock = new Date(w.clock.getTime() + 5 * 60 * 1000);
    await W.runRefresh(w);
    assert.ok(w.result, `second refresh failed: ${w.error}`);
  });

  define(/^the attention list is asked for$/, (w) => {
    w.attention = gt.queryAttention({ root: w.dir });
  });

  define(/^the report is emitted$/, (w) => {
    w.report = gt.emitReport({ root: w.dir });
  });

  // --- thens: saturation ----------------------------------------------------

  define(
    /^exactly one saturation condition forms, naming (\d) of 8 mined titles(?: and the 500-result bound)?$/,
    (w, n) => {
      const conds = saturationConditions(w);
      assert.strictEqual(conds.length, 1, `expected one condition, got ${conds.length}`);
      const c = conds[0];
      assert.strictEqual(c.count, Number(n));
      assert.strictEqual(c.of, 8);
      assert.ok(c.statement.includes(`${n} of 8`), c.statement);
      assert.ok(c.statement.includes('500-result'), c.statement);
    });

  define(/^the condition keeps all 8 affected titles and nothing else$/, (w) => {
    const c = saturationConditions(w)[0];
    assert.strictEqual(c.members.length, 8, `members: ${c.members.join(', ')}`);
    for (const t of w.titles) {
      assert.ok(c.members.includes(t), `condition members missing "${t}"`);
    }
  });

  define(/^no per-scenario saturation note appears$/, (w) => {
    const per = w.result.notes.filter(
      (/** @type {string} */ n) => n.includes('provenance mining for'));
    assert.deepStrictEqual(per, []);
  });

  define(/^the attention answer names the saturation as a limitation$/, (w) => {
    const a = gt.queryAttention({ root: w.dir });
    assert.ok(a.limitations.some((/** @type {string} */ l) =>
      l.includes('mined scenario titles hit')),
    `limitations: ${a.limitations.join(' | ')}`);
  });

  define(/^exactly the 3 saturated titles carry their own saturation notes$/, (w) => {
    const per = w.result.notes.filter(
      (/** @type {string} */ n) => n.includes('provenance mining for'));
    assert.strictEqual(per.length, 3, `saturation notes: ${per.join(' | ')}`);
    for (const t of w.saturated) {
      assert.ok(per.some((/** @type {string} */ n) => n.includes(`"${t}"`)),
        `no per-title note for "${t}"`);
    }
  });

  define(/^no corpus-level saturation condition forms$/, (w) => {
    assert.deepStrictEqual(saturationConditions(w), []);
  });

  // --- thens: quarantine ----------------------------------------------------

  define(/^exactly one rollup condition states that 9 of 12 feature files are quarantined$/,
    (w) => {
      const conds = w.result.conditions.filter(
        (/** @type {{kind: string}} */ c) => c.kind === 'quarantine-rollup');
      assert.strictEqual(conds.length, 1);
      const c = conds[0];
      assert.strictEqual(c.count, 9);
      assert.strictEqual(c.of, 12);
      assert.ok(c.statement.includes('9 of 12'), c.statement);
    });

  define(/^the cause counts read 5 and 4 with both causes named$/, (w) => {
    const c = w.result.conditions.find(
      (/** @type {{kind: string}} */ x) => x.kind === 'quarantine-rollup');
    assert.strictEqual(c.members.length, 2, `cause classes: ${c.members.join(' | ')}`);
    assert.ok(c.statement.includes('5× '), c.statement);
    assert.ok(c.statement.includes('4× '), c.statement);
    // The classes must still say what happened — a rollup of unintelligible
    // labels collapses nothing for the human.
    assert.ok(c.statement.includes('Examples'), c.statement);
    assert.ok(c.statement.includes('duplicate scenario title'), c.statement);
  });

  define(/^all 9 quarantined files remain individually named with their own errors$/, (w) => {
    const files = w.result.exceptions.map((/** @type {{file: string}} */ e) => e.file);
    assert.strictEqual(new Set(files).size, 9, `excepted files: ${files.join(', ')}`);
    for (const e of w.result.exceptions) {
      assert.ok(e.error.length > 0, `exception for ${e.file} without an error`);
    }
  });

  define(/^both refreshes state the identical condition$/, (w) => {
    assert.deepStrictEqual(w.result.conditions, w.firstConditions);
  });

  define(/^no rollup condition forms$/, (w) => {
    assert.ok(!w.result.conditions.some(
      (/** @type {{kind: string}} */ c) => c.kind === 'quarantine-rollup'));
  });

  define(/^the 3 files are named as exceptions$/, (w) => {
    assert.strictEqual(w.result.exceptions.length, 3);
  });

  // --- thens: design tier ---------------------------------------------------

  define(/^no unrefined-intent item appears$/, (w) => {
    assert.deepStrictEqual(
      w.attention.items.filter((/** @type {{tier: string}} */ i) => i.tier === 'unrefined'),
      []);
  });

  define(
    /^the answer states the design tier is absent and refinement ranking is unavailable for 40 scenarios$/,
    (w) => {
      assert.ok(w.attention.limitations.some((/** @type {string} */ l) =>
        l.includes('no design tier') && l.includes('40 scenarios')),
      `limitations: ${w.attention.limitations.join(' | ')}`);
    });

  define(/^the never-run scenario still ranks$/, (w) => {
    assert.ok(w.attention.items.some(
      (/** @type {{tier: string, title?: string}} */ i) =>
        i.tier === 'never-run' && i.title === w.neverRun),
    'the never-run scenario is missing from attention');
  });

  define(/^the declared-intent scenarios rank as unrefined$/, (w) => {
    const listed = w.attention.items
      .filter((/** @type {{tier: string}} */ i) => i.tier === 'unrefined')
      .map((/** @type {{title?: string}} */ i) => i.title);
    for (const t of w.unrefined) {
      assert.ok(listed.includes(t), `"${t}" missing from unrefined items`);
    }
  });

  define(/^the design file is named as an exception$/, (w) => {
    assert.ok(w.result.exceptions.some(
      (/** @type {{file: string}} */ e) => e.file === 'features/design/orders.feature'),
    `exceptions: ${JSON.stringify(w.result.exceptions)}`);
  });

  define(/^each of the 3 unrefined scenarios appears in the list$/, (w) => {
    const listed = w.attention.items
      .filter((/** @type {{tier: string}} */ i) => i.tier === 'unrefined')
      .map((/** @type {{title?: string}} */ i) => i.title);
    for (const t of w.unrefined) {
      assert.ok(listed.includes(t), `"${t}" missing from unrefined items`);
    }
    assert.strictEqual(listed.length, 3, `unexpected unrefined items: ${listed.join(', ')}`);
  });

  define(/^no design-tier-absence condition forms$/, (w) => {
    assert.ok(!w.result.conditions.some(
      (/** @type {{kind: string}} */ c) => c.kind === 'design-tier-absent'));
  });

  // --- thens: report --------------------------------------------------------

  define(/^the report's conditions census carries the design-tier statement$/, (w) => {
    assert.ok(w.report.includes('Conditions: 1'), 'no conditions census in the report');
    assert.ok(w.report.includes('- no design tier — refinement ranking unavailable (40 scenarios).'),
      'the census line is missing');
  });

  define(/^the report's notes carry no duplicate of it$/, (w) => {
    assert.ok(w.report.includes('Notes: 0'),
      'the notes census should be empty in this world');
  });
};
