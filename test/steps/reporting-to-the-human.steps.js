'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const gt = require('../../index');
const W = require('../world');

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

const FENCE = [
  '# Out of scope',
  '',
  '## Declined',
  '',
  '- **Partial refunds** — refunding half of a paid order or any partial',
  '  amount is declined. (2026-06-12)',
  '',
].join('\n');

const BREACH_SCENARIO = [
  'Feature: Payments',
  '  Scenario: Refund half of an order',
  '    Given a paid order',
  '    When half of the order amount is refunded',
  '    Then the partial refund is declined',
  '',
].join('\n');

/** @param {Record<string, any>} w @param {number} orphans */
async function breachWorld(w, orphans) {
  W.gitInit(w);
  W.writeFile(w, 'OUT-OF-SCOPE.md', FENCE);
  W.writeFile(w, 'features/payments.feature', BREACH_SCENARIO);
  const titles = Array.from({ length: orphans }, (_, i) => `Mechanism case ${i} holds`);
  W.writeFile(w, 'features/design/webhooks.feature', featureOf('Webhook mechanics', titles));
  W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
  await W.runRefresh(w);
  assert.ok(w.result, `refresh failed: ${w.error}`);
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  define(/^a picture holding a fence breach and (\d+) orphans$/, async (w, orphans) => {
    await breachWorld(w, Number(orphans));
  });

  define(/^a picture with a fence breach and an orphan$/, async (w) => {
    await breachWorld(w, 1);
  });

  define(/^the report is emitted$/, (w) => {
    w.report = gt.emitReport({ root: w.dir });
  });

  define(/^the attention list is the first section of the report$/, (w) => {
    const sections = w.report.split('\n').filter((/** @type {string} */ l) => l.startsWith('## '));
    assert.strictEqual(sections[0], '## Attention');
  });

  define(/^the report is emitted and the attention list is asked for$/, (w) => {
    w.report = gt.emitReport({ root: w.dir });
    w.list = gt.queryAttention({ root: w.dir });
  });

  define(/^the report's attention section lists the same items in the same order as the answer$/,
    (w) => {
      const lines = w.report.split('\n').filter((/** @type {string} */ l) => /^\d+\. \[/.test(l));
      assert.strictEqual(lines.length, w.list.items.length, 'item counts differ');
      w.list.items.forEach((/** @type {{title?: string, sessionId?: string, topic?: string, tier: string}} */ item,
        /** @type {number} */ i) => {
        const label = item.title ?? item.sessionId ?? item.topic ?? '';
        assert.ok(lines[i].includes(label) && lines[i].includes(`[${item.tier}]`),
          `line ${i} "${lines[i]}" does not match item "${label}"`);
      });
    });

  define(/^a picture with (\d+) reviewed scenarios, (\d+) reviewed-then-changed scenario, (\d+) orphans, and a contested region$/,
    async (w, reviewed, changed, orphans) => {
      W.gitInit(w);
      const nRev = Number(reviewed);
      const titles = Array.from({ length: nRev }, (_, i) => `Case c${i + 1} in orders settles fully`);
      W.writeFile(w, 'features/orders.feature', featureOf('Orders', titles));
      const lapsed = 'Ledger entries reconcile nightly';
      assert.strictEqual(Number(changed), 1);
      W.writeFile(w, 'features/ledger.feature', featureOf('Ledger', [lapsed]));
      const orphanTitles = Array.from({ length: Number(orphans) },
        (_, i) => `Mechanism case ${i} holds`);
      W.writeFile(w, 'features/design/webhooks.feature',
        featureOf('Webhook mechanics', orphanTitles));
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
      const start = W.toUnix('2026-07-20T10:00:00Z');
      await W.createJournalStore(w, [
        ...titles.map((t, i) => ({
          content: `Ruling: "${t}" is approved as specified.`,
          role: 'user',
          sessionId: 'ruling-session',
          createdAt: start + i * 60,
        })),
        {
          content: `Ruling: "${lapsed}" is approved as specified.`,
          role: 'user',
          sessionId: 'ruling-session',
          createdAt: start + nRev * 60,
        },
        // a contested region: heavy discussion of the ledger scenario that
        // outlives its spec change
        ...Array.from({ length: 25 }, (_, i) => ({
          content: `Round ${i}: "${lapsed}" is still being argued over and over.`,
          role: 'user',
          sessionId: 'ledger-talk',
          createdAt: W.toUnix('2026-07-26T09:00:00Z') + i * 60,
        })),
        ...Array.from({ length: 2 }, (_, i) => ({
          content: `Ambient note ${i} about the deploy tooling and the runners.`,
          role: 'user',
          sessionId: 'bg-one',
          createdAt: W.toUnix('2026-07-03T09:00:00Z') + i * 60,
        })),
      ]);
      W.writeFile(w, 'features/ledger.feature',
        featureOf('Ledger', [lapsed]).replace('it behaves as declared', 'it reconciles after the batch run'));
      W.gitCommit(w, 'post-ruling change', '2026-07-25T10:00:00Z');
      await W.runRefresh(w);
      assert.ok(w.result, `refresh failed: ${w.error}`);
      w.lapsed = lapsed;
      w.orphanTitles = orphanTitles;
    });

  define(/^the report states the reviewed set holds (\d+) scenarios$/, (w, n) => {
    assert.ok(w.report.includes(`Reviewed set: ${n} scenario(s)`),
      'reviewed-set count missing from the report');
  });

  define(/^the report lists the reviewed-then-changed scenario, both orphans, and the contested region$/,
    (w) => {
      // Assert against the Review-and-coverage SECTION alone — the heat and
      // attention sections must not satisfy these by accident.
      const section = w.report.split('## Review and coverage')[1]?.split('\n## ')[0];
      assert.ok(section, 'no review-and-coverage section');
      assert.ok(section.includes(`"${w.lapsed}"`), 'reviewed-then-changed scenario not listed');
      for (const t of w.orphanTitles) {
        assert.ok(section.includes(`"${t}"`), `orphan "${t}" not listed`);
      }
      assert.ok(section.includes('region ledger-talk'), 'contested region not listed');
    });

  define(/^a picture built by a refresh$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the report states the refresh time$/, (w) => {
    assert.ok(w.report.includes(`Refresh time: ${w.result.refreshedAt}`));
  });

  define(/^the report states the sources read$/, (w) => {
    assert.ok(w.report.includes('Sources read:'));
    assert.ok(w.report.includes('features/orders.feature'));
  });

  define(/^the report states the tool version that emitted it$/, (w) => {
    const version = require('../../package.json').version;
    assert.ok(w.report.includes(`Tool: gherkin-trace v${version}`));
  });

  define(/^a report emitted over a picture$/, async (w) => {
    await breachWorld(w, 1);
    w.first = gt.emitReport({ root: w.dir });
  });

  define(/^the report is emitted again with no source changes and no new refresh$/, (w) => {
    w.second = gt.emitReport({ root: w.dir });
  });

  define(/^the two reports are byte-identical$/, (w) => {
    assert.strictEqual(w.second, w.first);
  });

  define(/^a report emitted and committed after a refresh$/, async (w) => {
    await breachWorld(w, 1);
    w.first = gt.emitReport({ root: w.dir });
    W.gitCommit(w, 'commit the report artifacts', '2026-07-27T15:00:00Z');
  });

  define(/^a new refresh runs over byte-identical sources and the report is emitted$/,
    async (w) => {
      w.clock = new Date(w.clock.getTime() + 60 * 60 * 1000);
      await W.runRefresh(w);
      assert.ok(w.result, `second refresh failed: ${w.error}`);
      w.second = gt.emitReport({ root: w.dir });
    });

  define(/^the two reports differ only in the stated refresh time$/, (w) => {
    const a = w.first.split('\n');
    const b = w.second.split('\n');
    assert.strictEqual(a.length, b.length, 'reports differ in shape');
    const diffs = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) diffs.push({ from: a[i], to: b[i] });
    }
    assert.strictEqual(diffs.length, 1,
      `expected exactly one differing line, got ${JSON.stringify(diffs)}`);
    assert.ok(diffs[0].from.startsWith('Refresh time:'), 'the differing line is not the refresh time');
  });

  define(/^a refresh that failed partway through$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    // A prior GOOD picture: the dangerous world is a stale report served
    // after the later failure, not merely a missing one.
    await W.runRefresh(w);
    assert.ok(w.result, `first refresh failed: ${w.error}`);
    const dir = path.join(w.dir, 'journal');
    fs.mkdirSync(dir, { recursive: true });
    w.journalPath = path.join(dir, 'treecontext.db');
    fs.writeFileSync(w.journalPath, 'these bytes are not a sqlite database');
    await W.runRefresh(w);
    assert.ok(w.error, 'expected the refresh to fail');
  });

  define(/^a report is asked for$/, (w) => {
    w.report = null;
    w.error = null;
    try {
      w.report = gt.emitReport({ root: w.dir });
    } catch (e) {
      w.error = e;
    }
  });

  define(/^no report is emitted$/, (w) => {
    assert.strictEqual(w.report, null);
    assert.ok(w.error instanceof gt.GtRefusal, `expected refusal, got ${w.error}`);
  });

  define(/^the refusal states that (.+)$/, (w, expectation) => {
    assert.ok(w.error, 'no refusal was captured');
    for (const clause of expectation.split(' and that ')) {
      assert.ok(w.error.message.includes(clause),
        `refusal "${w.error.message}" does not state "${clause}"`);
    }
  });
};
