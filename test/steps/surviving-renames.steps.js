'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../world');

const UAT_FILE = 'features/refunds.feature';
const DESIGN_FILE = 'features/design/refunds.feature';

const UAT = [
  'Feature: Refunds',
  '  Scenario: Refund a cancelled order end to end',
  '    Given a cancelled order',
  '    Then the refund is issued',
  '',
].join('\n');

/** @param {string} title @param {string} [lastStep] */
function designFeature(title, lastStep = 'the gateway acknowledges the refund') {
  return [
    'Feature: Refund mechanics',
    `  Scenario: ${title}`,
    '    Given a cancelled order in the gateway sandbox',
    '    When the refund endpoint is called',
    `    Then ${lastStep}`,
    '',
  ].join('\n');
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  define(/^the scenario "([^"]+)" linked to a UAT parent and journal discussion$/,
    async (w, title) => {
      W.gitInit(w);
      W.writeFile(w, UAT_FILE, UAT);
      W.writeFile(w, DESIGN_FILE, designFeature(title));
      await W.createJournalStore(w, [{
        content: `Long discussion of "${title}" — the sandbox flow was settled here.`,
        role: 'user',
        sessionId: 'session-one',
        createdAt: 1752000000,
      }]);
      W.gitCommit(w, 'initial corpus', '2026-07-01T10:00:00Z');
      await W.runRefresh(w);
      assert.ok(w.result, `setup refresh failed: ${w.error}`);
      const d = W.dump(w);
      const design = d.nodes.find((n) => n.kind === 'scenario'
        && /** @type {{title: string}} */ (n.data).title === title);
      assert.ok(design, 'design scenario missing');
      assert.ok(d.edges.some((e) => e.class === 'refinement' && e.src === design.id),
        'setup: UAT-parent link not established');
      assert.ok(d.edges.some((e) => e.class === 'provenance' && e.src === design.id),
        'setup: journal link not established');
      w.oldTitle = title;
    });

  define(/^the scenario moves to another file and is retitled "([^"]+)" with its body untouched$/,
    (w, newTitle) => {
      // Moves OUTSIDE the refunds design area: direct directory resolution
      // fails for the new location, so an intact link can only come through
      // the identity thread — the strongest form of the claim.
      fs.rmSync(path.join(w.dir, DESIGN_FILE));
      W.writeFile(w, 'features/design/billing.feature', designFeature(newTitle));
      W.gitCommit(w, 'reorganize: move and retitle', '2026-07-15T10:00:00Z');
      w.newTitle = newTitle;
    });

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
  });

  define(/^the link to the UAT parent is intact$/, (w) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const d = W.dump(w);
    const design = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === w.newTitle);
    assert.ok(design, 'renamed scenario missing from picture');
    const ref = d.edges.find((e) => e.class === 'refinement' && e.src === design.id);
    assert.ok(ref, 'refinement link severed by the rename');
    const parent = d.nodes.find((n) => n.id === ref.dst);
    assert.ok(parent, 'refinement edge dangling');
    assert.strictEqual(/** @type {{file: string}} */ (parent.data).file, UAT_FILE);
    w.designNode = design;
  });

  define(/^the link to the journal discussion is intact$/, (w) => {
    const d = W.dump(w);
    const design = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === w.newTitle);
    assert.ok(design, 'renamed scenario missing from picture');
    const prov = d.edges.filter((e) => e.class === 'provenance' && e.src === design.id);
    assert.ok(prov.length > 0, 'journal link severed by the rename');
    // And identity carries the former title, so the link is explainable.
    const formers = /** @type {{formerTitles: Array<{title: string}>}} */ (design.data).formerTitles;
    assert.ok(formers.some((f) => f.title === w.oldTitle),
      'former title absent from identity');
  });

  define(/^the scenario "([^"]+)" no longer exists$/, async (w, title) => {
    W.gitInit(w);
    W.writeFile(w, 'features/payments.feature', [
      'Feature: Payments',
      '  Scenario: Charge a card',
      '    Given a valid card',
      '    Then the charge settles',
      '',
    ].join('\n'));
    W.writeFile(w, 'features/design/payments.feature', designFeature(title));
    W.gitCommit(w, 'initial corpus', '2026-07-01T10:00:00Z');
    fs.rmSync(path.join(w.dir, 'features/design/payments.feature'));
    w.oldTitle = title;
  });

  define(/^a similar scenario "([^"]+)" appeared in another file without a confirmable rename$/,
    (w, newTitle) => {
      // Same shape, one step edited: bodies differ, so the bytes cannot
      // confirm the rename — only offer it as a candidate.
      W.writeFile(w, 'features/design/billing.feature',
        designFeature(newTitle, 'the ledger shows the reversal'));
      W.gitCommit(w, 'reorganize without a trail', '2026-07-15T10:00:00Z');
      w.newTitle = newTitle;
    });

  define(/^the (?:old )?scenario's history is closed$/, (w) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const closed = w.result.closedThreads.find(
      (/** @type {{title: string}} */ t) => t.title === w.oldTitle);
    assert.ok(closed, 'old scenario thread not closed');
    w.closed = closed;
    const d = W.dump(w);
    assert.ok(d.nodes.some((n) => n.kind === 'closed_scenario'
      && /** @type {{title: string}} */ (n.data).title === w.oldTitle),
      'closed thread absent from the picture');
  });

  define(/^the new scenario starts unreviewed with no traced intent$/, (w) => {
    const d = W.dump(w);
    const node = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === w.newTitle);
    assert.ok(node, 'new scenario missing');
    const data = /** @type {Record<string, unknown>} */ (node.data);
    assert.notStrictEqual(data.reviewed, true, 'new scenario must not inherit review');
    assert.deepStrictEqual(data.formerTitles ?? [], [], 'new scenario must start a fresh thread');
    assert.ok(!d.edges.some((e) => e.class === 'refinement' && e.src === node.id),
      'new scenario must not inherit traced intent');
  });

  define(/^the report notes the broken thread$/, (w) => {
    assert.strictEqual(w.closed.reason, 'unconfirmed-rename');
    const d = W.dump(w);
    const threads = /** @type {Array<{title: string}>} */ (
      /** @type {{closedThreads: unknown}} */ (d.meta).closedThreads);
    assert.ok(threads.some((t) => t.title === w.oldTitle));
    // The NOTE, not just the data structure: the report says it in words.
    assert.ok(w.result.notes.some((/** @type {string} */ n) =>
      n.includes('identity thread broken') && n.includes(w.oldTitle)),
      'the report carries no broken-thread note');
  });

  define(/^"([^"]+)" is offered as a rename candidate with its evidence$/, (w, oldTitle) => {
    const closed = w.result.closedThreads.find(
      (/** @type {{title: string}} */ t) => t.title === oldTitle);
    assert.ok(closed, 'no closed thread for the old title');
    const cand = closed.candidates.find(
      (/** @type {{title: string}} */ c) => c.title === w.newTitle);
    assert.ok(cand, 'new scenario not offered as rename candidate');
    assert.ok(cand.evidence.stepOverlap >= 0.5,
      `candidate carries no step-overlap evidence: ${JSON.stringify(cand.evidence)}`);
  });

  // --- the neighborhood's history slot -------------------------------------

  define(/^the scenario "([^"]+)" formerly titled "([^"]+)"$/, async (w, now, before) => {
    W.gitInit(w);
    W.writeFile(w, DESIGN_FILE, designFeature(before));
    await W.createJournalStore(w, [{
      content: `Long discussion of "${before}" — the sandbox flow was settled here.`,
      role: 'user',
      sessionId: 'session-one',
      createdAt: W.toUnix('2026-07-05T10:00:00Z'),
    }]);
    W.gitCommit(w, 'initial corpus', '2026-07-01T10:00:00Z');
    W.writeFile(w, DESIGN_FILE, designFeature(now));
    W.gitCommit(w, 'retitle, body untouched', '2026-07-15T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.newTitle = now;
    w.oldTitle = before;
  });

  define(/^the neighborhood view is asked for$/, (w) => {
    const gt = require('../../index');
    w.view = gt.queryNeighborhood({ root: w.dir }, w.newTitle);
  });

  define(/^the former title "([^"]+)" is visible in the scenario's history$/, (w, former) => {
    const formers = w.view.history.formerTitles;
    assert.ok(formers.some((/** @type {{title: string}} */ f) => f.title === former),
      `history ${JSON.stringify(formers)} does not show "${former}"`);
  });

  // --- review-dependent rename scenarios -----------------------------------

  define(/^a reviewed scenario "([^"]+)"$/, async (w, title) => {
    W.gitInit(w);
    W.writeFile(w, DESIGN_FILE, designFeature(title));
    await W.createJournalStore(w, [{
      content: `Ruling: "${title}" is approved as specified.`,
      role: 'user',
      sessionId: 'session-one',
      createdAt: W.toUnix('2026-07-10T10:00:00Z'),
    }]);
    W.gitCommit(w, 'initial corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `setup refresh failed: ${w.error}`);
    const d = W.dump(w);
    const node = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === title);
    assert.ok(node, 'setup: scenario missing');
    assert.strictEqual(/** @type {{review?: {status: string}}} */ (node.data).review?.status,
      'reviewed', 'setup: scenario must start reviewed');
    w.oldTitle = title;
  });

  define(/^the scenario is still marked reviewed$/, (w) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const d = W.dump(w);
    const node = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === w.newTitle);
    assert.ok(node, 'renamed scenario missing');
    assert.strictEqual(/** @type {{review: {status: string}}} */ (node.data).review.status,
      'reviewed', 'review did not survive the pure rename');
  });

  define(/^a broken thread offering "([^"]+)" as a rename candidate$/, async (w, title) => {
    W.gitInit(w);
    W.writeFile(w, 'features/design/payments.feature', designFeature(title));
    await W.createJournalStore(w, [{
      content: `Long discussion of "${title}" — the sandbox flow was settled here.`,
      role: 'user',
      sessionId: 'session-one',
      createdAt: W.toUnix('2026-07-05T10:00:00Z'),
    }]);
    W.gitCommit(w, 'initial corpus', '2026-07-01T10:00:00Z');
    w.newTitle = 'Refund an order after cancellation';
    fs.rmSync(path.join(w.dir, 'features/design/payments.feature'));
    W.writeFile(w, 'features/design/billing.feature',
      designFeature(w.newTitle, 'the ledger shows the reversal'));
    W.gitCommit(w, 'reorganize without a trail', '2026-07-15T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `setup refresh failed: ${w.error}`);
    const broken = w.result.closedThreads.find(
      (/** @type {{title: string}} */ t) => t.title === title);
    assert.ok(broken, 'setup: thread must be broken');
    assert.ok(broken.candidates.some(
      (/** @type {{title: string}} */ c) => c.title === w.newTitle),
      'setup: candidate must be offered');
    w.oldTitle = title;
  });

  define(/^a user-authored journal ruling confirming the rename dated "([^"]+)"$/,
    async (w, date) => {
      await W.addJournalEntries(w, [{
        content: `Confirmed: "${w.oldTitle}" was renamed to "${w.newTitle}" — same scenario.`,
        role: 'user',
        sessionId: 'session-two',
        createdAt: W.toUnix(`${date}T10:00:00Z`),
      }]);
    });

  define(/^the new scenario carries the old scenario's history$/, (w) => {
    assert.ok(w.result, `refresh failed: ${w.error}`);
    const d = W.dump(w);
    const node = d.nodes.find((n) => n.kind === 'scenario'
      && /** @type {{title: string}} */ (n.data).title === w.newTitle);
    assert.ok(node, 'new scenario missing');
    const formers = /** @type {{formerTitles: Array<{title: string}>}} */ (node.data).formerTitles;
    assert.ok(formers.some((f) => f.title === w.oldTitle),
      'old identity absent from the healed thread');
    assert.ok(!w.result.closedThreads.some(
      (/** @type {{title: string}} */ t) => t.title === w.oldTitle),
      'thread still reported broken after the healing ruling');
    w.healedNode = node;
  });

  define(/^the journal links follow$/, (w) => {
    const d = W.dump(w);
    const prov = d.edges.filter((e) => e.class === 'provenance' && e.src === w.healedNode.id);
    assert.ok(prov.length > 0, 'journal links did not follow the healed thread');
    const linked = prov.map((e) => d.nodes.find((n) => n.id === e.dst));
    assert.ok(linked.some((n) => n && /** @type {{excerpt: string}} */ (n.data).excerpt.includes('Long discussion')),
      'the pre-rename discussion is not among the followed links');
  });

  define(/^the reconnection cites the ruling$/, (w) => {
    const healedBy = /** @type {{healedBy?: string}} */ (w.healedNode.data).healedBy;
    assert.ok(healedBy, 'healed thread carries no ruling citation');
    const d = W.dump(w);
    const entry = d.nodes.find((n) => n.kind === 'journal_entry'
      && /** @type {{tcNodeId: string}} */ (n.data).tcNodeId === healedBy);
    assert.ok(entry, 'healing citation does not resolve to a journal entry');
    assert.ok(/** @type {{excerpt: string}} */ (entry.data).excerpt.includes('renamed'),
      'citation does not point at the confirming ruling');
  });

  define(/^the scenario is deleted with no similar scenario appearing$/, (w) => {
    fs.rmSync(path.join(w.dir, DESIGN_FILE));
    W.gitCommit(w, 'remove the scenario', '2026-07-15T10:00:00Z');
  });

  define(/^the report names the deleted scenario as reviewed intent removed$/, (w) => {
    const closed = w.result.closedThreads.find(
      (/** @type {{title: string}} */ t) => t.title === w.oldTitle);
    assert.ok(closed, 'deleted scenario has no closed thread');
    assert.strictEqual(closed.reason, 'deleted');
    assert.strictEqual(closed.reviewedAtClosure, true,
      'closure does not carry the reviewed mark');
    assert.ok(w.result.notes.some((/** @type {string} */ n) =>
      n.includes('reviewed intent removed')),
      'the report does not name the removal');
  });
};
