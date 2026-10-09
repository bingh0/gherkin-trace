'use strict';
const assert = require('node:assert');
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

/** @param {string} session @param {number} count @param {string} fromIso @param {(i: number) => string} contentOf */
function sessionEntries(session, count, fromIso, contentOf) {
  const start = W.toUnix(fromIso);
  return Array.from({ length: count }, (_, i) => ({
    content: contentOf(i),
    role: 'user',
    sessionId: session,
    createdAt: start + i * 60,
  }));
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  define(/^a picture with a fence breach, an orphan, and a contested region$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'OUT-OF-SCOPE.md', [
      '# Out of scope',
      '',
      '## Declined',
      '',
      '- **Partial refunds** — refunding half of a paid order or any partial',
      '  amount is declined. (2026-06-12)',
      '',
    ].join('\n'));
    W.writeFile(w, 'features/payments.feature', [
      'Feature: Payments',
      '  Scenario: Refund half of an order',
      '    Given a paid order',
      '    When half of the order amount is refunded',
      '    Then the partial refund is declined',
      '',
    ].join('\n'));
    W.writeFile(w, 'features/exchanges.feature', featureOf('Exchanges', ['Item exchanges settle cleanly']));
    W.writeFile(w, 'features/design/exchanges.feature',
      featureOf('Exchange mechanics', ['Item exchanges settle cleanly via credit notes']));
    W.writeFile(w, 'features/design/webhooks.feature',
      featureOf('Webhook mechanics', ['Retry webhook delivery']));
    await W.createJournalStore(w, [
      ...sessionEntries('exchange-talk', 25, '2026-07-05T09:00:00Z',
        (i) => `Round ${i} still arguing "Item exchanges settle cleanly via credit notes".`),
      ...sessionEntries('bg-one', 2, '2026-07-03T09:00:00Z',
        (i) => `Ambient note ${i} about the build tooling and its quirks.`),
      ...sessionEntries('bg-two', 3, '2026-07-04T09:00:00Z',
        (i) => `Ambient note ${i} about the release dates we picked.`),
    ]);
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the attention list is asked for$/, (w) => {
    w.list = gt.queryAttention({ root: w.dir });
  });

  define(/^the breach ranks first, the orphan second, and the contested region third$/, (w) => {
    const items = w.list.items;
    assert.ok(items.length >= 3, `only ${items.length} items`);
    assert.strictEqual(items[0].tier, 'breach');
    assert.strictEqual(items[0].title, 'Refund half of an order');
    assert.strictEqual(items[1].tier, 'orphan');
    assert.strictEqual(items[1].title, 'Retry webhook delivery');
    assert.strictEqual(items[2].tier, 'contested');
    assert.strictEqual(items[2].sessionId, 'exchange-talk');
  });

  define(/^each item cites its evidence$/, (w) => {
    for (const item of w.list.items) {
      assert.ok(item.evidence && Object.keys(item.evidence).length > 0,
        `${item.title ?? item.sessionId ?? item.topic} carries no evidence`);
    }
  });

  define(/^a picture with a never-run scenario and an orphan$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/ops.feature', featureOf('Ops', ['Deploys roll back cleanly', 'Alerts page the on-call']));
    W.writeFile(w, 'features/design/webhooks.feature', featureOf('Webhook mechanics', ['Retry webhook delivery']));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    w.scenarios = [
      { file: 'features/ops.feature', title: 'Deploys roll back cleanly' },
      { file: 'features/ops.feature', title: 'Alerts page the on-call' },
      { file: 'features/design/webhooks.feature', title: 'Retry webhook delivery' },
    ];
    W.writeManifest(w, { omit: ['Deploys roll back cleanly'] });
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the never-run scenario ranks above the orphan$/, (w) => {
    const items = w.list.items;
    const never = items.findIndex((/** @type {{tier: string}} */ i) => i.tier === 'never-run');
    const orphan = items.findIndex((/** @type {{tier: string}} */ i) => i.tier === 'orphan');
    assert.ok(never !== -1 && orphan !== -1, 'both items must be present');
    assert.ok(never < orphan, 'never-run does not outrank the orphan');
  });

  define(/^a picture with no breaches, no orphans, no unrefined intent, and no pressure signals$/,
    async (w) => {
      await healthyWorld(w, { flatHeat: false });
    });

  define(/^the list is empty$/, (w) => {
    if (!w.list) w.list = gt.queryAttention({ root: w.dir });
    assert.deepStrictEqual(w.list.items, []);
  });

  define(/^the answer states the refresh time$/, (w) => {
    assert.strictEqual(w.list.refreshedAt, w.result.refreshedAt);
  });

  define(/^no item is manufactured to fill the list$/, (w) => {
    assert.strictEqual(w.list.items.length, 0);
    for (const t of w.list.tiers) assert.strictEqual(t.count, 0);
  });

  define(/^a picture with no defects and no pressure signals$/, async (w) => {
    await healthyWorld(w, { flatHeat: true });
  });

  define(/^heat classification withheld for lack of a natural break$/, (w) => {
    assert.strictEqual(W.dump(w).meta.heatWithheld, true,
      'world must genuinely withhold heat');
  });

  define(/^the answer states that heat classification was withheld$/, (w) => {
    assert.ok(w.list.limitations.some((/** @type {string} */ l) => l.includes('withheld')),
      `limitations ${JSON.stringify(w.list.limitations)} do not state the withholding`);
  });

  define(/^(\d+) orphan design scenarios across (\d+) feature files$/, async (w, total, files) => {
    W.project(w);
    const nFiles = Number(files);
    const nTotal = Number(total);
    const biggest = 48;
    const rest = (nTotal - biggest) / (nFiles - 1);
    assert.ok(Number.isInteger(rest), 'world shape must divide evenly');
    let written = 0;
    for (let f = 1; f <= nFiles; f++) {
      const n = f === 1 ? biggest : rest;
      const titles = Array.from({ length: n }, (_, i) => `Mechanism f${f} case ${i} holds`);
      W.writeFile(w, `features/design/f${String(f).padStart(2, '0')}.feature`,
        featureOf(`Mechanics ${f}`, titles));
      written += n;
    }
    assert.strictEqual(written, nTotal, `world wrote ${written}, wanted ${nTotal}`);
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^all (\d+) orphans are listed, grouped by feature file$/, (w, total) => {
    const orphans = w.list.items.filter((/** @type {{tier: string}} */ i) => i.tier === 'orphan');
    assert.strictEqual(orphans.length, Number(total), 'orphans were truncated');
    const block = w.list.tiers.find((/** @type {{tier: string}} */ t) => t.tier === 'orphan');
    assert.strictEqual(block.groups.reduce(
      (/** @type {number} */ a, /** @type {{count: number}} */ g) => a + g.count, 0), Number(total));
    assert.ok(block.groups.length > 1, 'grouping absent');
  });

  define(/^the group summary names the largest cluster$/, (w) => {
    const block = w.list.tiers.find((/** @type {{tier: string}} */ t) => t.tier === 'orphan');
    assert.ok(block.largestCluster, 'no largest cluster named');
    assert.strictEqual(block.largestCluster.count, 48);
    assert.strictEqual(block.largestCluster.file, 'features/design/f01.feature');
  });

  define(/^the scenario "([^"]+)" that is a possible breach, contested, and unreviewed$/,
    async (w, title) => {
      W.gitInit(w);
      W.writeFile(w, 'OUT-OF-SCOPE.md', [
        '# Out of scope',
        '',
        '## Declined',
        '',
        '- **Partial refunds by gateway** — refunding half of a paid order,',
        '  partial captures, credit ledger reversals, and gateway amount',
        '  splits are declined. (2026-06-12)',
        '',
      ].join('\n'));
      // Two of the three topic tokens (partial, refund — not gateway):
      // arguable under the topic-anchored rule, never full containment.
      W.writeFile(w, 'features/payments.feature', [
        'Feature: Payments',
        `  Scenario: ${title}`,
        '    Given a cancelled order',
        '    When the customer asks',
        '    Then the partial refund stays declined',
        '',
      ].join('\n'));
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
      await W.createJournalStore(w, [
        ...sessionEntries('half-talk', 25, '2026-07-05T09:00:00Z',
          (i) => `Round ${i}: "${title}" keeps coming back up, unresolved.`),
        ...sessionEntries('bg-one', 2, '2026-07-03T09:00:00Z',
          (i) => `Ambient note ${i} about the build tooling and its quirks.`),
        ...sessionEntries('bg-two', 3, '2026-07-04T09:00:00Z',
          (i) => `Ambient note ${i} about the release dates we picked.`),
      ]);
      await W.runRefresh(w);
      assert.ok(w.result, `refresh failed: ${w.error}`);
      w.target = title;
    });

  define(/^the scenario appears exactly once, in the possible-breach tier$/, (w) => {
    const mine = w.list.items.filter(
      (/** @type {{title?: string}} */ i) => i.title === w.target);
    assert.strictEqual(mine.length, 1, `scenario appears ${mine.length} times`);
    assert.strictEqual(mine[0].tier, 'possible-breach');
    // The absorbed REGION must not double as its own contested item.
    assert.ok(!w.list.items.some(
      (/** @type {{sessionId?: string}} */ i) => i.sessionId === 'half-talk'),
      'the absorbed contested region is double-listed');
    const contested = w.list.tiers.find(
      (/** @type {{tier: string}} */ t) => t.tier === 'contested');
    assert.strictEqual(contested.count, 0, 'contested tier still lists items');
    w.item = mine[0];
  });

  define(/^the contested and unreviewed signals are listed beneath it with their evidence$/,
    (w) => {
      const signals = w.item.absorbed.map((/** @type {{signal: string}} */ s) => s.signal);
      assert.ok(signals.includes('contested'), `absorbed ${JSON.stringify(signals)} lack contested`);
      assert.ok(signals.includes('unreviewed'), `absorbed ${JSON.stringify(signals)} lack unreviewed`);
      for (const s of w.item.absorbed) {
        assert.ok(Object.keys(s.evidence).length > 0, `${s.signal} carries no evidence`);
      }
    });

  define(/^the lower tiers state how many items were absorbed above$/, (w) => {
    const contested = w.list.tiers.find(
      (/** @type {{tier: string}} */ t) => t.tier === 'contested');
    assert.ok(contested.absorbed >= 1,
      `contested tier states ${contested.absorbed} absorbed`);
  });

  define(/^two orphans of equal rank in the files "([^"]+)" and "([^"]+)"$/,
    async (w, a, b) => {
      W.project(w);
      W.writeFile(w, `features/design/${a}`, featureOf('Billing mechanics', ['Route ledger entries']));
      W.writeFile(w, `features/design/${b}`, featureOf('Payment mechanics', ['Route gateway calls']));
      await W.runRefresh(w);
      assert.ok(w.result, `refresh failed: ${w.error}`);
      w.files = [`features/design/${a}`, `features/design/${b}`];
    });

  define(/^the attention list is asked for twice over an unchanged picture$/, (w) => {
    w.list = gt.queryAttention({ root: w.dir });
    w.listAgain = gt.queryAttention({ root: w.dir });
  });

  define(/^both lists are byte-identical$/, (w) => {
    assert.strictEqual(JSON.stringify(w.list), JSON.stringify(w.listAgain));
  });

  define(/^the orphans are ordered by file path then title$/, (w) => {
    const orphans = w.list.items.filter((/** @type {{tier: string}} */ i) => i.tier === 'orphan');
    assert.strictEqual(orphans.length, 2);
    assert.strictEqual(orphans[0].file, w.files[0]);
    assert.strictEqual(orphans[1].file, w.files[1]);
  });
};

/**
 * A picture with nothing to report: refined, reviewed, run, fenced-clean.
 * @param {Record<string, any>} w @param {{flatHeat: boolean}} shape
 */
async function healthyWorld(w, { flatHeat }) {
  W.gitInit(w);
  const uat = 'Orders settle end to end';
  const design = 'Orders settle end to end via the ledger';
  W.writeFile(w, 'features/orders.feature', featureOf('Orders', [uat]));
  W.writeFile(w, 'features/design/orders.feature', featureOf('Order mechanics', [design]));
  W.writeFile(w, 'OUT-OF-SCOPE.md', [
    '# Out of scope',
    '',
    '## Declined',
    '',
    '- **Legacy exports** — nightly CSV dumps to the SFTP dropbox stay out. (2026-06-12)',
    '',
  ].join('\n'));
  W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
  const rulings = [uat, design].map((t, i) => ({
    content: `Ruling: "${t}" is approved as specified.`,
    role: 'user',
    sessionId: 'ruling-session',
    createdAt: W.toUnix('2026-07-20T10:00:00Z') + i * 60,
  }));
  const discussion = flatHeat
    ? [
      ...sessionEntries('talk-one', 3, '2026-07-05T09:00:00Z',
        (i) => `Note ${i} on how the orders flow should settle.`),
      ...sessionEntries('talk-two', 4, '2026-07-06T09:00:00Z',
        (i) => `Note ${i} on the ledger side of the settling flow.`),
      ...sessionEntries('talk-three', 3, '2026-07-07T09:00:00Z',
        (i) => `Note ${i} on rollout order for the settling work.`),
    ]
    : [
      ...sessionEntries('settled-talk', 25, '2026-07-05T09:00:00Z',
        (i) => `Round ${i} hammering out "${design}" before review.`),
      ...sessionEntries('bg-one', 2, '2026-07-03T09:00:00Z',
        (i) => `Ambient note ${i} about the build tooling and its quirks.`),
    ];
  await W.createJournalStore(w, [...rulings, ...discussion]);
  w.scenarios = [
    { file: 'features/orders.feature', title: uat },
    { file: 'features/design/orders.feature', title: design },
  ];
  W.writeManifest(w);
  await W.runRefresh(w);
  const assert2 = require('node:assert');
  assert2.ok(w.result, `refresh failed: ${w.error}`);
}
