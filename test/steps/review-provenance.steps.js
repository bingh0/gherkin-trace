'use strict';
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const gt = require('../../index');
const W = require('../world');

const FILE = 'features/refunds.feature';

/** @param {string} title @param {string} [thenStep] */
function refundsFeature(title, thenStep = 'the refund is issued in full') {
  return [
    'Feature: Refunds',
    `  Scenario: ${title}`,
    '    Given a cancelled order',
    '    When a refund is requested',
    `    Then ${thenStep}`,
    '',
  ].join('\n');
}

/**
 * @param {Record<string, any>} w @param {string} title
 * @param {Array<{content: string, role?: string, sessionId?: string, createdAt?: number}>} entries
 */
async function corpusWithJournal(w, title, entries) {
  W.gitInit(w);
  W.writeFile(w, FILE, refundsFeature(title));
  await W.createJournalStore(w, entries);
  W.gitCommit(w, 'initial corpus', '2026-07-01T10:00:00Z');
  w.title = title;
}

/** @param {Record<string, any>} w @param {string} title */
function scenarioNode(w, title) {
  const d = W.dump(w);
  const node = d.nodes.find((n) => n.kind === 'scenario'
    && /** @type {{title: string}} */ (n.data).title === title);
  assert.ok(node, `scenario "${title}" missing from picture`);
  return /** @type {{data: Record<string, any>}} */ (node);
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  define(/^journal evidence of a human ruling on the scenario "([^"]+)"$/,
    async (w, title) => {
      await corpusWithJournal(w, title, [
        {
          content: `We walked through "${title}" step by step this morning.`,
          role: 'user',
          createdAt: W.toUnix('2026-07-10T09:00:00Z'),
        },
        {
          content: `Ruling: "${title}" is approved as specified.`,
          role: 'user',
          createdAt: W.toUnix('2026-07-10T10:00:00Z'),
        },
      ]);
    });

  define(/^a harness notification carrying ruling words for the scenario "([^"]+)"$/,
    async (w, title) => {
      // Identical ruling sentence to the human case, wrapped in notification
      // markup: the only discriminator is who is speaking.
      await corpusWithJournal(w, title, [{
        content: `<task-notification>\nRuling: "${title}" is approved as specified.\n</task-notification>`,
        role: 'user',
        createdAt: W.toUnix('2026-07-10T10:00:00Z'),
      }]);
    });

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
  });

  define(/^"([^"]+)" is marked reviewed$/, (w, title) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const node = scenarioNode(w, title);
    assert.strictEqual(node.data.review?.status, 'reviewed');
  });

  define(/^the reviewed mark carries a pointer to the ruling in the journal$/, (w) => {
    const node = scenarioNode(w, w.title);
    const ruling = node.data.review.ruling;
    assert.ok(ruling?.tcNodeId, 'reviewed mark carries no journal pointer');
    const d = W.dump(w);
    assert.ok(d.nodes.some((n) => n.kind === 'human_ruling'
      && /** @type {{tcNodeId: string}} */ (n.data).tcNodeId === ruling.tcNodeId),
      'ruling pointer does not resolve to a human_ruling node');
  });

  define(/^a picture with (\d+) reviewed scenarios$/, async (w, n) => {
    W.gitInit(w);
    const count = Number(n);
    const lines = ['Feature: Orders'];
    /** @type {Array<{content: string, role: string, createdAt: number}>} */
    const entries = [];
    w.uatTitles = [];
    for (let i = 1; i <= count; i++) {
      const title = `Case c${i} in orders settles fully`;
      w.uatTitles.push(title);
      lines.push(`  Scenario: ${title}`);
      lines.push(`    Given an order in case c${i}`);
      lines.push('    Then the order settles');
      entries.push({
        content: `Ruling: "${title}" passed review.`,
        role: 'user',
        createdAt: W.toUnix('2026-07-10T10:00:00Z') + i * 60,
      });
    }
    W.writeFile(w, 'features/orders.feature', lines.join('\n') + '\n');
    await W.createJournalStore(w, entries);
    W.gitCommit(w, 'orders corpus', '2026-07-01T10:00:00Z');
  });

  define(/^every design scenario traces to a reviewed scenario$/, (w) => {
    W.writeFile(w, 'features/design/orders.feature', [
      'Feature: Order mechanics',
      '  Scenario: Case c1 in orders settles fully via the retry queue',
      '    Given the retry queue is drained',
      '    Then case c1 settles',
      '  Scenario: Case c2 in orders settles fully after gateway timeout',
      '    Given the gateway times out once',
      '    Then case c2 settles',
      '',
    ].join('\n'));
    W.gitCommit(w, 'design tier', '2026-07-02T10:00:00Z');
  });

  define(/^the invariant check runs$/, async (w) => {
    if (!w.result) await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.invariant = gt.queryInvariant({ root: w.dir });
  });

  define(/^the report states the reviewed set holds (\d+) scenarios$/, (w, n) => {
    assert.strictEqual(w.invariant.reviewedSet.count, Number(n));
    // Count AND membership: the right scenarios, not any n of them.
    if (w.uatTitles) {
      const names = w.invariant.reviewedSet.scenarios.map(
        (/** @type {{title: string}} */ s) => s.title).sort();
      assert.deepStrictEqual(names, [...w.uatTitles].sort());
    }
  });

  define(/^the report states that intent coverage is complete$/, (w) => {
    assert.strictEqual(w.invariant.intentCoverage.complete, true);
    assert.deepStrictEqual(w.invariant.intentCoverage.breakers, []);
  });

  define(/^a picture where the design scenario "([^"]+)" traces only to an unreviewed UAT scenario$/,
    async (w, designTitle) => {
      W.gitInit(w);
      W.writeFile(w, 'features/webhooks.feature', [
        'Feature: Webhooks',
        '  Scenario: Webhook delivery reaches every subscriber',
        '    Given a subscribed endpoint',
        '    Then the webhook is delivered',
        '',
      ].join('\n'));
      W.writeFile(w, 'features/design/webhooks.feature', [
        'Feature: Webhook mechanics',
        `  Scenario: ${designTitle}`,
        '    Given a failed delivery',
        '    Then the delivery is retried',
        '',
      ].join('\n'));
      await W.createJournalStore(w, [{
        content: 'General discussion of webhook delivery ordering, no verdicts.',
        role: 'user',
        createdAt: W.toUnix('2026-07-10T10:00:00Z'),
      }]);
      W.gitCommit(w, 'webhooks corpus', '2026-07-01T10:00:00Z');
      await W.runRefresh(w);
      assert.ok(w.result, `refresh failed: ${w.error}`);
      // The trace must exist for "traces only to an unreviewed" to be the
      // failure mode — an orphan would be a different breaker.
      const d = W.dump(w);
      const design = scenarioNode(w, designTitle);
      assert.ok(d.edges.some((e) => e.class === 'refinement'
        && e.src === /** @type {{id?: number}} */ (design).id),
        'setup: design scenario must trace to the UAT scenario');
      w.designTitle = designTitle;
    });

  define(/^the report states that intent coverage is incomplete$/, (w) => {
    assert.strictEqual(w.invariant.intentCoverage.complete, false);
  });

  define(/^the report names "([^"]+)"$/, (w, title) => {
    assert.ok(w.invariant.intentCoverage.breakers.some(
      (/** @type {{title: string}} */ b) => b.title === title),
      `breakers do not name "${title}"`);
  });

  define(/^journal discussion mentioning "([^"]+)" alongside a ruling-shaped remark not clearly about it$/,
    async (w, title) => {
      await corpusWithJournal(w, title, [
        {
          content: `We dug into "${title}" edge cases for most of the session.`,
          role: 'user',
          sessionId: 'session-one',
          createdAt: W.toUnix('2026-07-10T10:00:00Z'),
        },
        {
          content: 'Fine — approved, ship that whole area.',
          role: 'user',
          sessionId: 'session-one',
          createdAt: W.toUnix('2026-07-10T10:05:00Z'),
        },
      ]);
    });

  define(/^"([^"]+)" is not marked reviewed$/, (w, title) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const node = scenarioNode(w, title);
    assert.notStrictEqual(node.data.review?.status, 'reviewed');
  });

  define(/^the ruling-candidates list carries the remark with its journal pointer$/, (w) => {
    const node = scenarioNode(w, w.title);
    const cands = node.data.rulingCandidates;
    assert.ok(Array.isArray(cands) && cands.length > 0, 'no ruling candidates surfaced');
    assert.ok(cands[0].tcNodeId, 'candidate carries no journal pointer');
    assert.ok(cands[0].excerpt.includes('approved'), 'candidate does not carry the remark');
  });

  define(/^the scenario "([^"]+)" with a ruling dated "([^"]+)" and a contrary ruling dated "([^"]+)"$/,
    async (w, title, first, second) => {
      await corpusWithJournal(w, title, [
        {
          content: `Ruling: "${title}" is declined pending the legal check.`,
          role: 'user',
          createdAt: W.toUnix(`${first}T10:00:00Z`),
        },
        {
          content: `Ruling: legal cleared it — "${title}" is approved.`,
          role: 'user',
          createdAt: W.toUnix(`${second}T10:00:00Z`),
        },
      ]);
    });

  define(/^the reviewed mark stands on the ruling dated "([^"]+)"$/, (w, date) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const node = scenarioNode(w, w.title);
    assert.strictEqual(node.data.review.status, 'reviewed');
    assert.ok(node.data.review.ruling.date.startsWith(date),
      `reviewed mark stands on ${node.data.review.ruling.date}, expected ${date}`);
  });

  define(/^both ruling pointers are carried so the conflict can be re-litigated$/, (w) => {
    const node = scenarioNode(w, w.title);
    assert.strictEqual(node.data.review.rulings.length, 2);
    const polarities = node.data.review.rulings.map(
      (/** @type {{polarity: string}} */ r) => r.polarity).sort();
    assert.deepStrictEqual(polarities, ['negative', 'positive']);
  });

  define(/^the scenario "([^"]+)" reviewed by a ruling dated "([^"]+)"$/,
    async (w, title, date) => {
      await corpusWithJournal(w, title, [{
        content: `Ruling: "${title}" is approved as specified.`,
        role: 'user',
        createdAt: W.toUnix(`${date}T10:00:00Z`),
      }]);
    });

  define(/^its steps changed on "([^"]+)"$/, (w, date) => {
    W.writeFile(w, FILE, refundsFeature(w.title, 'the refund is issued minus fees'));
    W.gitCommit(w, 'change the outcome', `${date}T10:00:00Z`);
  });

  define(/^the scenario is marked reviewed-then-changed$/, (w) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const node = scenarioNode(w, w.title);
    assert.strictEqual(node.data.review.status, 'reviewed-then-changed');
  });

  define(/^the report carries both the ruling pointer and the change$/, (w) => {
    const node = scenarioNode(w, w.title);
    assert.ok(node.data.review.ruling?.tcNodeId, 'ruling pointer missing');
    assert.ok(node.data.review.change?.date, 'change missing');
  });

  define(/^its steps carry an uncommitted change that could predate or postdate the ruling$/,
    (w) => {
      // Edited in the working tree, never committed: the change interval is
      // (last commit, refresh], and the ruling date falls inside it.
      fs.writeFileSync(path.join(w.dir, FILE),
        refundsFeature(w.title, 'the refund is issued minus fees'));
    });

  define(/^the report states the order of ruling and change could not be established$/, (w) => {
    const node = scenarioNode(w, w.title);
    assert.strictEqual(node.data.review.change.orderEstablished, false);
    assert.ok(w.result.notes.some((/** @type {string} */ n) =>
      n.includes('could not be established')),
      'the report does not state the ambiguity');
  });

};
