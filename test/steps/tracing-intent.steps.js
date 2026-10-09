'use strict';
const assert = require('node:assert');
const gt = require('../../index');
const W = require('../world');

const UAT_TITLE = 'Refund a cancelled order';

/** @param {string[]} titles @param {string} feature */
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

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  define(/^a UAT scenario "([^"]+)" with no design scenario refining it$/, (w, title) => {
    W.gitInit(w);
    W.writeFile(w, 'features/refunds.feature', featureOf('Refunds', [title]));
    // An intact pair, so "not listed" has something real to not-list.
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Case c1 in orders settles fully']));
    W.writeFile(w, 'features/design/orders.feature',
      featureOf('Order mechanics', ['Case c1 in orders settles fully via retries']));
    w.unrefined = title;
  });

  define(/^a design scenario "([^"]+)" with no traceable UAT parent$/, (w, title) => {
    W.writeFile(w, 'features/design/webhooks.feature', featureOf('Webhook mechanics', [title]));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    w.orphan = title;
  });

  define(/^the exception view is asked for$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.view = gt.queryExceptions({ root: w.dir });
  });

  define(/^"([^"]+)" is listed as an orphan$/, (w, title) => {
    assert.ok(w.view.orphans.some((/** @type {{title: string}} */ o) => o.title === title),
      `orphans ${JSON.stringify(w.view.orphans)} do not list "${title}"`);
  });

  define(/^"([^"]+)" is listed as unrefined$/, (w, title) => {
    assert.ok(w.view.unrefined.some((/** @type {{title: string}} */ o) => o.title === title),
      `unrefined ${JSON.stringify(w.view.unrefined)} do not list "${title}"`);
  });

  define(/^scenarios with intact links are not listed$/, (w) => {
    const listed = [...w.view.orphans, ...w.view.unrefined]
      .map((/** @type {{title: string}} */ x) => x.title);
    assert.ok(!listed.some((t) => t.includes('Case c1')),
      `intact pair leaked into the exception view: ${JSON.stringify(listed)}`);
  });

  define(/^a UAT scenario "([^"]+)" refined by (\d+) design scenarios$/,
    async (w, title, n) => {
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', featureOf('Refunds', [title]));
      w.designTitles = [
        `${title} via the gateway`,
        `${title} after settlement`,
        `${title} with a retry`,
      ].slice(0, Number(n));
      W.writeFile(w, 'features/design/refunds.feature',
        featureOf('Refund mechanics', w.designTitles));
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
      w.scenarios = [
        { file: 'features/refunds.feature', title },
        ...w.designTitles.map((/** @type {string} */ t) =>
          ({ file: 'features/design/refunds.feature', title: t })),
      ];
      W.writeManifest(w);
      w.title = title;
    });

  define(/^the downward lookup asks what refines it$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.answer = gt.queryDown({ root: w.dir }, w.title);
  });

  define(/^the (\d+) design scenarios are listed$/, (w, n) => {
    assert.strictEqual(w.answer.refinements.length, Number(n));
    const titles = w.answer.refinements.map((/** @type {{title: string}} */ r) => r.title).sort();
    assert.deepStrictEqual(titles, [...w.designTitles].sort());
  });

  define(/^each listed scenario shows its binding status$/, (w) => {
    for (const r of w.answer.refinements) {
      assert.strictEqual(r.bindingStatus, 'passed', `${r.title} lacks binding status`);
    }
  });

  define(/^a design scenario "([^"]+)" refining the UAT scenario "([^"]+)"$/,
    async (w, design, uat) => {
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', featureOf('Refunds', [uat]));
      W.writeFile(w, 'features/design/refunds.feature', featureOf('Refund mechanics', [design]));
      await W.createJournalStore(w, [{
        content: `Ruling: "${uat}" is approved as specified.`,
        role: 'user',
        createdAt: W.toUnix('2026-07-10T10:00:00Z'),
      }]);
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
      w.design = design;
      w.uat = uat;
    });

  define(/^the upward lookup asks what intent it traces to$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.answer = gt.queryUp({ root: w.dir }, w.design);
  });

  define(/^"([^"]+)" is named with its review status$/, (w, title) => {
    assert.ok(w.answer.intent, 'no intent traced');
    assert.strictEqual(w.answer.intent.title, title);
    assert.strictEqual(w.answer.intent.review, 'reviewed');
  });

  define(/^a design scenario with a UAT parent, (\d+) sibling design scenarios, journal discussion, and an adjacent fence ruling$/,
    async (w, siblings) => {
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', featureOf('Refunds', [UAT_TITLE]));
      w.target = `${UAT_TITLE} via the gateway with the partial amount declined`;
      w.siblingTitles = [
        `${UAT_TITLE} after settlement`,
        `${UAT_TITLE} with a retry`,
      ].slice(0, Number(siblings));
      W.writeFile(w, 'features/design/refunds.feature',
        featureOf('Refund mechanics', [w.target, ...w.siblingTitles]));
      W.writeFile(w, 'OUT-OF-SCOPE.md', [
        '# Out of scope',
        '',
        '## Declined',
        '',
        '- **Partial refunds** — refunding a partial amount of an order is',
        '  declined territory, gateway or not. (2026-06-12)',
        '',
      ].join('\n'));
      await W.createJournalStore(w, [{
        content: `Design talk: "${w.target}" needs the sandbox gateway settled first.`,
        role: 'user',
        createdAt: W.toUnix('2026-07-05T10:00:00Z'),
      }]);
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
      w.scenarios = [
        { file: 'features/refunds.feature', title: UAT_TITLE },
        { file: 'features/design/refunds.feature', title: w.target },
        ...w.siblingTitles.map((/** @type {string} */ t) =>
          ({ file: 'features/design/refunds.feature', title: t })),
      ];
      // One sibling FAILED: the view must surface real statuses, not a
      // constant.
      w.failedSibling = w.siblingTitles[0];
      W.writeManifest(w, { statuses: { [w.failedSibling]: 'failed' } });
    });

  define(/^the neighborhood view is asked for$/, async (w) => {
    if (!w.result) await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.view = gt.queryNeighborhood({ root: w.dir }, w.target);
  });

  define(/^the view shows the UAT parent$/, (w) => {
    assert.strictEqual(w.view.parent.title, UAT_TITLE);
  });

  define(/^the view shows both siblings with their binding status$/, (w) => {
    const sibs = w.view.siblings.siblings;
    assert.ok(Array.isArray(sibs), 'sibling slot empty');
    assert.deepStrictEqual(
      sibs.map((/** @type {{title: string}} */ s) => s.title).sort(),
      [...w.siblingTitles].sort());
    for (const s of sibs) {
      assert.strictEqual(s.bindingStatus,
        s.title === w.failedSibling ? 'failed' : 'passed',
        `${s.title} carries the wrong binding status`);
    }
  });

  define(/^the view shows the journal discussion$/, (w) => {
    assert.ok(Array.isArray(w.view.journal.discussion) && w.view.journal.discussion.length > 0,
      'journal slot empty');
  });

  define(/^the view shows the adjacent fence ruling$/, (w) => {
    assert.ok(Array.isArray(w.view.fence.rulings) && w.view.fence.rulings.length > 0,
      'fence slot empty');
    assert.strictEqual(w.view.fence.rulings[0].topic, 'Partial refunds');
  });

  define(/^a design scenario with a UAT parent, no sibling design scenarios, no journal discussion, and no adjacent fence ruling$/,
    async (w) => {
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', featureOf('Refunds', [UAT_TITLE]));
      w.target = `${UAT_TITLE} via the gateway`;
      W.writeFile(w, 'features/design/refunds.feature', featureOf('Refund mechanics', [w.target]));
      // A fence file EXISTS (unrelated topic): "no adjacent ruling was
      // found" must be a mined truth, not a dark source dressed as one.
      W.writeFile(w, 'OUT-OF-SCOPE.md', [
        '# Out of scope',
        '',
        '## Declined',
        '',
        '- **Legacy exports** — nightly CSV dumps to the SFTP dropbox stay out. (2026-06-12)',
        '',
      ].join('\n'));
      await W.createJournalStore(w, [{
        content: 'Ambient discussion about the deploy pipeline, unrelated to any scenario.',
        role: 'user',
        createdAt: W.toUnix('2026-07-05T10:00:00Z'),
      }]);
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    });

  define(/^the sibling slot states it is the sole refinement of its intent$/, (w) => {
    assert.ok(w.view.siblings.absent?.includes('sole refinement'),
      `sibling slot: ${JSON.stringify(w.view.siblings)}`);
  });

  define(/^the journal slot states the scenario is unexamined$/, (w) => {
    assert.ok(w.view.journal.absent?.includes('unexamined'),
      `journal slot: ${JSON.stringify(w.view.journal)}`);
  });

  define(/^the fence slot states no adjacent ruling was found as of the refresh time$/, (w) => {
    assert.ok(w.view.fence.absent?.includes('no adjacent ruling was found as of'),
      `fence slot: ${JSON.stringify(w.view.fence)}`);
    assert.ok(w.view.fence.absent.includes(w.result.refreshedAt),
      'fence slot absence does not carry the refresh time');
  });

  define(/^a picture refreshed at "([^"]+) ([^"]+)"$/, async (w, date, time) => {
    W.gitInit(w);
    W.writeFile(w, 'features/refunds.feature', featureOf('Refunds', [UAT_TITLE]));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    w.clock = new Date(`${date}T${time}:00Z`);
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^any trace lookup answers$/, (w) => {
    w.answer = gt.queryNeighborhood({ root: w.dir }, UAT_TITLE);
  });

  define(/^the answer states the refresh time "([^"]+)"$/, (w, when) => {
    assert.strictEqual(w.answer.refreshedAt, when);
  });

  define(/^the answer states whether any source changed since (?:that time|the refresh)$/, (w) => {
    assert.strictEqual(typeof w.answer.sourcesChanged, 'boolean');
    assert.strictEqual(w.answer.sourcesChanged, false, 'nothing changed yet');
    // And the statement is live, not decorative: touch a source, ask again.
    W.writeFile(w, 'features/refunds.feature',
      featureOf('Refunds', [UAT_TITLE, 'A brand new scenario appears']));
    const again = gt.queryNeighborhood({ root: w.dir }, UAT_TITLE);
    assert.strictEqual(again.sourcesChanged, true,
      'a changed source went unreported');
  });

  define(/^a picture holding a scenario titled "([^"]+)"$/, async (w, title) => {
    W.gitInit(w);
    // A second, unrelated scenario makes "closest" a ranking, not an echo.
    W.writeFile(w, 'features/refunds.feature',
      featureOf('Refunds', [title, 'Charge a card cleanly']));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.held = title;
  });

  define(/^a lookup asks for a title the picture does not contain$/, (w) => {
    w.missTitle = 'Refund a canceled order';
    w.answer = gt.queryNeighborhood({ root: w.dir }, w.missTitle);
  });

  define(/^the answer states the title is not in the picture as of the refresh time$/, (w) => {
    assert.strictEqual(w.answer.miss, true);
    assert.ok(w.answer.statement.includes('not in the picture'));
    assert.ok(w.answer.statement.includes(w.result.refreshedAt));
  });

  define(/^the closest titles the picture does hold are offered$/, (w) => {
    assert.ok(w.answer.nearMatches.length > 0, 'no near matches offered');
    // CLOSEST first: the refund title outranks the unrelated card title.
    assert.strictEqual(w.answer.nearMatches[0].title, w.held,
      `nearest match is ${w.answer.nearMatches[0].title}`);
  });

  define(/^an orphan design scenario whose journal discussion mentions the UAT scenario "([^"]+)"$/,
    async (w, uat) => {
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', featureOf('Refunds', [uat]));
      w.target = 'Route ledger entries for reversals';
      W.writeFile(w, 'features/design/billing.feature',
        featureOf('Billing mechanics', [w.target]));
      await W.createJournalStore(w, [{
        content: `Discussing "${w.target}" — it really exists to refine "${uat}".`,
        role: 'user',
        createdAt: W.toUnix('2026-07-05T10:00:00Z'),
      }]);
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
      w.uat = uat;
    });

  define(/^the parent slot states that no intent is traced$/, (w) => {
    assert.ok(w.view.parent.absent?.includes('no intent is traced'),
      `parent slot: ${JSON.stringify(w.view.parent)}`);
  });

  define(/^"([^"]+)" is offered as a candidate parent citing the journal evidence$/,
    (w, title) => {
      const cand = w.view.parent.candidates.find(
        (/** @type {{title: string}} */ c) => c.title === title);
      assert.ok(cand, `candidates ${JSON.stringify(w.view.parent.candidates)} miss "${title}"`);
      assert.ok(cand.evidence.tcNodeId, 'candidate cites no journal evidence');
    });

  define(/^a (UAT|design) scenario$/, async (w, tier) => {
    W.gitInit(w);
    W.writeFile(w, 'features/refunds.feature', featureOf('Refunds', [UAT_TITLE]));
    W.writeFile(w, 'features/design/refunds.feature',
      featureOf('Refund mechanics', [`${UAT_TITLE} via the gateway`]));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.target = tier === 'UAT' ? UAT_TITLE : `${UAT_TITLE} via the gateway`;
  });

  define(/^the (upward|downward) lookup is asked$/, (w, direction) => {
    w.answer = direction === 'upward'
      ? gt.queryUp({ root: w.dir }, w.target)
      : gt.queryDown({ root: w.dir }, w.target);
  });

  define(/^the answer states the scenario sits at the (UAT|design) tier$/, (w, tier) => {
    assert.strictEqual(w.answer.tier, tier.toLowerCase());
    assert.ok(w.answer.statement.includes(`${tier} tier`) || w.answer.statement.includes(`${tier.toLowerCase()} tier`),
      `statement does not teach the tier: ${w.answer.statement}`);
  });

  define(/^the answer offers the (downward|upward) lookup instead$/, (w, useful) => {
    assert.strictEqual(w.answer.offer, useful);
  });
};
