'use strict';
const assert = require('node:assert');
const W = require('../world');

// Fence worlds: an out-of-scope file is the sole authority; discussion and
// scenarios press against it from the journal and the corpus.

/**
 * @param {string} dates e.g. "2026-06-12" or "2026-06-12; reaffirmed 2026-07-10"
 * @param {{guardians?: string[], adjustment?: boolean}} [opts]
 */
function fenceFile(dates, { guardians = [], adjustment = false } = {}) {
  const guarded = guardians.length === 0 ? ''
    : ` Guarded by: ${guardians.map((g) => `"${g}"`).join(', ')}.`;
  const lines = [
    '# Out of scope',
    '',
    '## Declined',
    '',
    `- **Partial refunds** — refunding half of an order, or any partial`,
    `  amount, is declined territory.${guarded} (${dates})`,
  ];
  if (adjustment) {
    lines.push(
      `- **Invoice adjustment after delivery** — adjusting an invoice once`,
      `  the order has shipped is declined territory. (${dates})`);
  }
  lines.push('');
  return lines.join('\n');
}

const BASE_FEATURE = [
  'Feature: Payments',
  '  Scenario: Charge a card',
  '    Given a valid card',
  '    Then the charge settles',
  '',
].join('\n');

/** @param {Record<string, any>} w */
function fenceNode(w) {
  const d = W.dump(w);
  const node = d.nodes.find((n) => n.kind === 'fence_ruling'
    && /** @type {{topic: string}} */ (n.data).topic === 'Partial refunds');
  assert.ok(node, 'fence ruling missing from picture');
  return /** @type {{data: Record<string, any>}} */ (node);
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  define(/^a fence ruling declining partial refunds dated "([^"]+)"$/, (w, date) => {
    W.gitInit(w);
    W.writeFile(w, 'OUT-OF-SCOPE.md', fenceFile(date));
    if (!w.baseWritten) {
      W.writeFile(w, 'features/payments.feature', BASE_FEATURE);
      w.baseWritten = true;
    }
    W.gitCommit(w, 'fence ruled', `${date}T10:00:00Z`);
    w.fenceDate = date;
  });

  define(/^a fence ruling declining partial refunds kept beside the feature files$/, (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/OUT-OF-SCOPE.md', fenceFile('2026-06-12'));
    if (!w.baseWritten) {
      W.writeFile(w, 'features/payments.feature', BASE_FEATURE);
      w.baseWritten = true;
    }
    W.gitCommit(w, 'fence ruled beside the features', '2026-06-12T10:00:00Z');
    w.fenceDate = '2026-06-12';
  });

  define(/^the picture reads the fence from "([^"]+)"$/, (w, p) => {
    assert.equal(w.result.sources.fence, p);
  });

  define(/^a note names the shadowed fence at "([^"]+)"$/, (w, p) => {
    assert.ok(
      w.result.notes.some((/** @type {string} */ n) =>
        n.includes('shadow') && n.includes(p)),
      `no shadowed-fence note naming ${p} in: ${JSON.stringify(w.result.notes)}`);
  });

  define(/^no scenarios about partial refunds$/, async (w) => {
    // The discriminating world: heavy discussion of the fenced topic with no
    // scenarios — exactly what would read under-covered were it not fenced.
    // PLUS an equally heavy unrelated uncaptured session: suppression must
    // fire on the topic match only, never on "uncaptured near a fence".
    const entries = Array.from({ length: 25 }, (_, i) => ({
      content: `More thoughts (${i}) on partial refunds and how half of an order might come back.`,
      role: 'user',
      sessionId: 'fenced-talk',
      createdAt: W.toUnix('2026-05-20T09:00:00Z') + i * 60,
    }));
    const unrelated = Array.from({ length: 24 }, (_, i) => ({
      content: `Deep dive (${i}) into the migration tooling weeds and the runner matrix.`,
      role: 'user',
      sessionId: 'unrelated-talk',
      createdAt: W.toUnix('2026-05-22T09:00:00Z') + i * 60,
    }));
    await W.createJournalStore(w, [
      ...entries,
      ...unrelated,
      {
        content: 'Unrelated ambient note about the deploy pipeline and its runners.',
        role: 'user',
        sessionId: 'bg-one',
        createdAt: W.toUnix('2026-05-21T09:00:00Z'),
      },
      {
        content: 'Another ambient note about release dates and the changelog.',
        role: 'user',
        sessionId: 'bg-one',
        createdAt: W.toUnix('2026-05-21T09:05:00Z'),
      },
    ]);
  });

  define(/^the report is emitted$/, async (w) => {
    if (!w.result) await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^partial refunds is not reported as under-covered$/, (w) => {
    const d = W.dump(w);
    const region = d.nodes.find((n) => n.kind === 'region'
      && /** @type {{sessionId: string}} */ (n.data).sessionId === 'fenced-talk');
    assert.ok(region, 'the fenced discussion region is missing');
    const data = /** @type {{state: string, flag: unknown}} */ (region.data);
    assert.notStrictEqual(data.state, 'uncaptured',
      'fenced territory reported as under-covered');
    assert.strictEqual(data.flag, null, 'fenced territory carries a coverage flag');
    w.region = region;
  });

  define(/^the suppression cites the fence ruling$/, (w) => {
    const suppressed = /** @type {{suppressedBy?: {topic: string, line: number}}} */ (
      w.region.data).suppressedBy;
    assert.ok(suppressed, 'suppression carries no citation');
    assert.strictEqual(suppressed.topic, 'Partial refunds');
    assert.ok(suppressed.line > 0, 'citation does not point into the fence file');
    // And the unrelated heavy uncaptured session keeps its flag — only a
    // clear topic match may silence one.
    const d = W.dump(w);
    const unrelated = d.nodes.find((n) => n.kind === 'region'
      && /** @type {{sessionId: string}} */ (n.data).sessionId === 'unrelated-talk');
    assert.ok(unrelated, 'unrelated region missing');
    assert.strictEqual(/** @type {{state: string}} */ (unrelated.data).state, 'uncaptured',
      'unrelated uncaptured region was wrongly suppressed');
    assert.strictEqual(/** @type {{flag: unknown}} */ (unrelated.data).flag, 'hottest');
  });

  define(/^user-authored journal discussion of partial refunds dated "([^"]+)"$/,
    async (w, date) => {
      const entries = [{
        content: 'Could we revisit partial refunds for the enterprise tier after all?',
        role: 'user',
        sessionId: 'pressure-talk',
        createdAt: W.toUnix(`${date}T10:00:00Z`),
      }];
      if (w.journalPath) await W.addJournalEntries(w, entries);
      else await W.createJournalStore(w, entries);
    });

  define(/^partial refunds is flagged fence-under-pressure$/, (w) => {
    const pressure = fenceNode(w).data.pressure;
    assert.ok(pressure, 'fence carries no pressure flag');
    assert.ok(pressure.entries.length > 0, 'pressure cites no discussion');
    w.pressure = pressure;
  });

  define(/^the flag asks for the ruling to be reconsidered or reaffirmed$/, (w) => {
    assert.ok(w.pressure.ask.includes('reconsider') && w.pressure.ask.includes('reaffirm'),
      `the flag does not ask: ${w.pressure.ask}`);
  });

  define(/^a harness notification dated "([^"]+)" whose text discusses partial refunds$/,
    async (w, date) => {
      // The discriminating content: names the fenced topic in ruling-adjacent
      // language, wears role user — only the notification markup separates it
      // from the owner's own voice.
      const entries = [{
        content: '<task-notification>\nAgent finished: reviewed partial refunds '
          + 'handling and how half of an order might come back.\n</task-notification>',
        role: 'user',
        sessionId: 'pressure-talk',
        createdAt: W.toUnix(`${date}T10:00:00Z`),
      }];
      if (w.journalPath) await W.addJournalEntries(w, entries);
      else await W.createJournalStore(w, entries);
    });

  define(/^a ruling reaffirming the fence dated "([^"]+)"$/, (w, date) => {
    // Reaffirmation is transcription: the fence file itself carries the new
    // date — the journal is never the fence authority.
    W.writeFile(w, 'OUT-OF-SCOPE.md', fenceFile(`${w.fenceDate}; reaffirmed ${date}`));
    W.gitCommit(w, 'fence reaffirmed', `${date}T10:00:00Z`);
    w.reaffirmed = date;
  });

  define(/^partial refunds is not flagged fence-under-pressure$/, (w) => {
    assert.strictEqual(fenceNode(w).data.pressure, null,
      'pressure flag survives the reaffirmation');
  });

  define(/^the fence stands on the ruling dated "([^"]+)"$/, (w, date) => {
    assert.strictEqual(fenceNode(w).data.effectiveDate, date);
  });

  define(/^a scenario "([^"]+)" that existed before "([^"]+)"$/, (w, title, date) => {
    W.gitInit(w);
    W.writeFile(w, 'features/payments.feature', [
      'Feature: Payments',
      '  Scenario: Charge a card',
      '    Given a valid card',
      '    Then the charge settles',
      `  Scenario: ${title}`,
      '    Given a paid order',
      '    When half of the order amount is refunded',
      '    Then the partial refund is declined by the gateway',
      '',
    ].join('\n'));
    w.baseWritten = true;
    const before = new Date(Date.parse(`${date}T00:00:00Z`) - 20 * 86400000)
      .toISOString();
    W.gitCommit(w, 'scenario predates the fence', before);
    w.breachTitle = title;
  });

  define(/^"([^"]+)" is reported as a fence breach$/, (w, title) => {
    const d = W.dump(w);
    const node = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === title);
    assert.ok(node, 'breaching scenario missing');
    const edge = d.edges.find((e) => e.class === 'fence' && e.src === node.id
      && /** @type {{kind: string}} */ (e.data).kind === 'breach');
    assert.ok(edge, `"${title}" carries no breach edge`);
    w.breachEdge = edge;
  });

  define(/^the breach notes that the scenario predates the ruling$/, (w) => {
    assert.strictEqual(/** @type {{predates: boolean}} */ (w.breachEdge.data).predates, true);
    assert.ok(w.result.notes.some((/** @type {string} */ n) =>
      n.includes('predates its ruling')),
      'the report does not note the predating');
  });

  define(/^a scenario "([^"]+)" added on "([^"]+)" clearly inside that territory$/,
    (w, title, date) => {
      W.writeFile(w, 'features/refund-mechanics.feature', [
        'Feature: Refund mechanics',
        `  Scenario: ${title}`,
        '    Given a paid order',
        '    When half of the order amount is refunded',
        '    Then the partial refund is declined',
        '',
      ].join('\n'));
      // A design tier with an orphan keeps lower-tier items in the list —
      // "outranks every other item" needs other items to exist.
      W.writeFile(w, 'features/design/ledger.feature', [
        'Feature: Ledger mechanics',
        '  Scenario: Ledger backfill drains nightly',
        '    Given a settled day',
        '    Then the backfill drains',
        '',
      ].join('\n'));
      W.gitCommit(w, 'breaching scenario added', `${date}T10:00:00Z`);
      w.breachTitle = title;
    });

  define(/^the breach outranks every other item in the attention list$/, (w) => {
    const gt = require('../../index');
    const list = gt.queryAttention({ root: w.dir });
    assert.ok(list.items.length > 1, 'the list needs other items to outrank');
    assert.strictEqual(list.items[0].tier, 'breach');
    assert.strictEqual(list.items[0].title, w.breachTitle);
  });

  define(/^a fence ruling declining partial refunds$/, (w) => {
    W.gitInit(w);
    W.writeFile(w, 'OUT-OF-SCOPE.md', fenceFile('2026-06-12'));
    w.fenceDate = '2026-06-12';
  });

  define(/^a fence ruling declining invoice adjustment after delivery$/, (w) => {
    W.writeFile(w, 'OUT-OF-SCOPE.md', fenceFile(w.fenceDate, { adjustment: true }));
  });

  define(/^the fence names "([^"]+)" as a guardian of that ruling$/, (w, title) => {
    W.writeFile(w, 'OUT-OF-SCOPE.md', fenceFile(w.fenceDate, { guardians: [title] }));
    W.gitCommit(w, 'guardian named', `${w.fenceDate}T11:00:00Z`);
  });

  define(/^a scenario "([^"]+)" whose match to the adjustment ruling is arguable$/,
    async (w, title) => {
      // Shares invoice/adjustment/after with the four-token topic but not
      // "delivery" — three of four topic tokens: arguable, not containment.
      W.writeFile(w, 'features/billing.feature', [
        'Feature: Billing',
        `  Scenario: ${title}`,
        '    Given a shipped order',
        '    When the invoice is adjusted after shipping',
        '    Then the adjusted amount replaces the original',
        '',
      ].join('\n'));
      // Ranking needs neighbors on both sides: a confirmed breach above,
      // a pressure signal below. And a one-shared-token bystander pins the
      // arguable floor from below: sharing a word is not a breach.
      W.writeFile(w, 'features/refund-mechanics.feature', [
        'Feature: Refund mechanics',
        '  Scenario: Refund half of an order',
        '    Given a paid order',
        '    When half of the order amount is refunded',
        '    Then the partial refund is declined',
        '',
      ].join('\n'));
      W.writeFile(w, 'features/cards.feature', [
        'Feature: Cards',
        '  Scenario: Charge a card for an order',
        '    Given a valid card',
        '    Then the charge settles',
        '',
      ].join('\n'));
      await W.createJournalStore(w, [{
        content: 'Could we revisit partial refunds for the enterprise tier after all?',
        role: 'user',
        sessionId: 'pressure-talk',
        createdAt: W.toUnix('2026-07-02T10:00:00Z'),
      }]);
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
      w.arguable = title;
    });

  define(/^"([^"]+)" is reported as a possible breach$/, (w, title) => {
    const d = W.dump(w);
    const node = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === title);
    assert.ok(node, 'arguable scenario missing');
    const edge = d.edges.find((e) => e.class === 'fence' && e.src === node.id);
    assert.ok(edge, `"${title}" carries no fence edge`);
    assert.strictEqual(/** @type {{kind: string}} */ (edge.data).kind, 'possible');
    // The floor holds from below: one shared token is no breach at all.
    const bystander = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === 'Charge a card for an order');
    assert.ok(bystander, 'bystander scenario missing');
    assert.ok(!d.edges.some((e) => e.class === 'fence' && e.src === bystander.id),
      'a one-token bystander was marked a possible breach');
  });

  define(/^the possible breach cites both the scenario and the adjustment ruling$/, (w) => {
    const gt = require('../../index');
    w.list = gt.queryAttention({ root: w.dir });
    const item = w.list.items.find((/** @type {{title?: string}} */ i) => i.title === w.arguable);
    assert.ok(item, 'possible breach missing from the attention list');
    assert.strictEqual(item.evidence.scenario, w.arguable);
    assert.strictEqual(item.evidence.fence, 'Invoice adjustment after delivery');
  });

  define(/^"([^"]+)" is not reported as any breach$/, (w, title) => {
    const d = W.dump(w);
    const node = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === title);
    assert.ok(node, 'guardian scenario missing from the picture');
    const tiered = d.edges.filter((e) => e.class === 'fence' && e.src === node.id
      && /** @type {{kind: string}} */ (e.data).kind !== 'guardian');
    assert.strictEqual(tiered.length, 0,
      `guardian carries breach-tier fence edges: ${JSON.stringify(tiered.map((e) => e.data))}`);
    const gt = require('../../index');
    const list = gt.queryAttention({ root: w.dir });
    assert.ok(!list.items.some((/** @type {{title?: string, tier: string}} */ i) =>
      i.title === title && (i.tier === 'breach' || i.tier === 'possible-breach')),
      'guardian appears in a breach tier of the attention list');
    w.guardianNode = node;
  });

  define(/^the picture cites the guardianship of the fence ruling$/, (w) => {
    const d = W.dump(w);
    const edge = d.edges.find((e) => e.class === 'fence' && e.src === w.guardianNode.id
      && /** @type {{kind: string}} */ (e.data).kind === 'guardian');
    assert.ok(edge, 'no guardian edge cites the fence ruling');
    assert.ok(w.result.notes.some((/** @type {string} */ n) =>
      n.includes('guards the fence entry "Partial refunds"')),
      'the refresh notes do not cite the guardianship');
  });

  define(/^possible breaches rank above pressure signals and below confirmed breaches$/,
    (w) => {
      const idx = (/** @type {string} */ tier) =>
        w.list.items.findIndex((/** @type {{tier: string}} */ i) => i.tier === tier);
      const breach = idx('breach');
      const possible = idx('possible-breach');
      const pressure = idx('pressure');
      assert.ok(breach !== -1 && possible !== -1 && pressure !== -1,
        `all three tiers must be present: ${JSON.stringify(w.list.items.map(
          (/** @type {{tier: string}} */ i) => i.tier))}`);
      assert.ok(breach < possible && possible < pressure,
        `order breach=${breach} possible=${possible} pressure=${pressure}`);
    });

  define(/^a project with no out-of-scope list$/, (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/payments.feature', BASE_FEATURE);
    W.gitCommit(w, 'initial', '2026-07-01T10:00:00Z');
  });

  define(/^the report names fence signals as dark$/, (w) => {
    assert.ok(w.result.dark.includes('fence signals'));
    assert.ok(w.result.absent.includes('out-of-scope list'));
  });
};
