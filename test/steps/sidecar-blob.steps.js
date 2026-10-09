'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const gt = require('../../index');
const W = require('../world');

/** @param {Record<string, any>} w @returns {string} */
function blobPath(w) {
  return path.join(w.dir, '.gherkin-trace', 'sidecar.json');
}

/** @param {Record<string, any>} w */
function readBlob(w) {
  return JSON.parse(fs.readFileSync(blobPath(w), 'utf8'));
}

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

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  define(/^a picture built by a refresh$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the sidecar blob sits beside the refresh record$/, (w) => {
    assert.ok(fs.existsSync(blobPath(w)), 'no sidecar blob written');
    assert.ok(fs.existsSync(path.join(w.dir, '.gherkin-trace', 'refresh.json')),
      'refresh record missing');
  });

  define(/^the blob states the tool name, the schema version, and the refresh time it stands on$/,
    (w) => {
      const b = readBlob(w);
      assert.strictEqual(b.tool, 'gherkin-trace');
      assert.strictEqual(b.v, 1);
      assert.strictEqual(b.basis.at, w.result.refreshedAt);
    });

  define(/^a project where no refresh has ever run$/, (w) => {
    W.project(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
  });

  define(/^no sidecar blob exists$/, (w) => {
    assert.ok(!fs.existsSync(blobPath(w)), 'a blob exists before any refresh');
  });

  define(/^no placeholder is written that could read as health$/, (w) => {
    assert.ok(!fs.existsSync(path.join(w.dir, '.gherkin-trace')),
      'artifact dir exists before any refresh');
  });

  define(/^a picture with a fence breach, an orphan, and a reviewed scenario$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'OUT-OF-SCOPE.md', [
      '# Out of scope', '', '## Declined', '',
      '- **Partial refunds** — refunding half of a paid order or any partial',
      '  amount is declined. (2026-06-12)', '',
    ].join('\n'));
    W.writeFile(w, 'features/payments.feature', [
      'Feature: Payments',
      '  Scenario: Refund half of an order',
      '    Given a paid order',
      '    When half of the order amount is refunded',
      '    Then the partial refund is declined',
      '',
    ].join('\n'));
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    W.writeFile(w, 'features/design/webhooks.feature',
      featureOf('Webhook mechanics', ['Retry webhook delivery']));
    await W.createJournalStore(w, [{
      content: 'Ruling: "Orders settle end to end" is approved as specified.',
      role: 'user',
      createdAt: W.toUnix('2026-07-10T10:00:00Z'),
    }]);
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
  });

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the blob's rows carry the attention count with its top tier$/, (w) => {
    const rows = readBlob(w).rows;
    const attention = rows.find((/** @type {{label: string}} */ r) => r.label === 'attention');
    assert.ok(attention, 'no attention row');
    const list = gt.queryAttention({ root: w.dir });
    assert.strictEqual(attention.value, String(list.items.length));
    assert.ok(attention.detail.includes(list.items[0].tier),
      `detail "${attention.detail}" does not carry the top tier`);
    w.list = list;
  });

  define(/^the blob's rows carry the reviewed-set count$/, (w) => {
    const reviewed = readBlob(w).rows.find(
      (/** @type {{label: string}} */ r) => r.label === 'reviewed');
    assert.ok(reviewed, 'no reviewed row');
    assert.strictEqual(reviewed.value, '1');
  });

  define(/^every count in the blob equals the same count in the report$/, (w) => {
    const report = gt.emitReport({ root: w.dir });
    const rows = readBlob(w).rows;
    const attention = rows.find((/** @type {{label: string}} */ r) => r.label === 'attention');
    const reviewed = rows.find((/** @type {{label: string}} */ r) => r.label === 'reviewed');
    const reportItems = report.split('\n').filter((/** @type {string} */ l) => /^\d+\. \[/.test(l));
    assert.strictEqual(attention.value, String(reportItems.length),
      'attention count disagrees with the report');
    assert.ok(report.includes(`Reviewed set: ${reviewed.value} scenario(s)`),
      'reviewed count disagrees with the report');
  });

  define(/^a project with feature files and a journal but no binding status$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    await W.createJournalStore(w, [{
      content: 'General discussion of order settling, no verdicts.',
      role: 'user',
      createdAt: W.toUnix('2026-07-10T10:00:00Z'),
    }]);
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
  });

  define(/^the blob's binding row carries the dark status$/, (w) => {
    const binding = readBlob(w).rows.find(
      (/** @type {{label: string}} */ r) => r.label === 'binding');
    assert.ok(binding, 'no binding row');
    assert.strictEqual(binding.status, 'dark');
  });

  define(/^no row about a dark family reads as all-clear$/, (w) => {
    const b = readBlob(w);
    const dark = new Set(w.result.dark);
    const familyOf = /** @type {Record<string, string>} */ ({
      binding: 'binding signals',
      fence: 'fence signals',
      heat: 'heat',
      reviewed: 'review status',
    });
    for (const r of b.rows) {
      const family = familyOf[r.label];
      if (family !== undefined && dark.has(family)) {
        assert.strictEqual(r.status, 'dark',
          `dark family "${family}" reads as ${r.status}`);
      }
    }
  });

  define(/^a picture whose heat classification is withheld for lack of a natural break$/,
    async (w) => {
      W.gitInit(w);
      W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
      const start = W.toUnix('2026-07-05T09:00:00Z');
      /** @type {any[]} */
      const entries = [];
      // flat densities: 3 / 4 / 3 — no honest break
      for (const [i, session] of ['talk-one', 'talk-two', 'talk-three'].entries()) {
        const n = i === 1 ? 4 : 3;
        for (let j = 0; j < n; j++) {
          entries.push({
            content: `Note ${j} in ${session} about the settling flow and its rollout.`,
            role: 'user',
            sessionId: session,
            createdAt: start + i * 3600 + j * 60,
          });
        }
      }
      await W.createJournalStore(w, entries);
      W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    });

  define(/^the blob's heat row carries the dark status$/, (w) => {
    const heat = readBlob(w).rows.find((/** @type {{label: string}} */ r) => r.label === 'heat');
    assert.ok(heat, 'no heat row');
    assert.strictEqual(heat.status, 'dark');
  });

  define(/^the heat row states that classification was withheld$/, (w) => {
    const heat = readBlob(w).rows.find((/** @type {{label: string}} */ r) => r.label === 'heat');
    assert.ok(`${heat.value} ${heat.detail ?? ''}`.includes('withheld'));
  });

  define(/^(\d+) feature files of which one fails to parse$/, (w, count) => {
    W.gitInit(w);
    for (let i = 1; i < Number(count); i++) {
      W.writeFile(w, `features/area-${i}.feature`, featureOf(`Area ${i}`, [`Area ${i} settles`]));
    }
    W.writeFile(w, 'features/broken.feature', [
      'Feature: Broken area',
      '  Scenario Outline: an outline missing its examples',
      '    Given a step with <placeholder>',
      '',
    ].join('\n'));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
  });

  define(/^the blob's exceptions row states the count of excepted files$/, (w) => {
    const ex = readBlob(w).rows.find((/** @type {{label: string}} */ r) => r.label === 'exceptions');
    assert.ok(ex, 'no exceptions row');
    assert.strictEqual(ex.value, '1');
  });

  define(/^the exceptions row does not read as all-clear$/, (w) => {
    const ex = readBlob(w).rows.find((/** @type {{label: string}} */ r) => r.label === 'exceptions');
    assert.notStrictEqual(ex.status, 'ok');
  });

  define(/^a fully run corpus with no design tier$/, (w) => {
    W.writeFeatures(w, 2, 6);
    W.writeManifest(w);
  });

  define(/^the blob's attention row carries the dark status$/, (w) => {
    const a = readBlob(w).rows.find((/** @type {{label: string}} */ r) => r.label === 'attention');
    assert.ok(a, 'no attention row');
    assert.strictEqual(a.status, 'dark');
    assert.strictEqual(a.value, '0');
  });

  define(/^the attention row states that refinement ranking is dark$/, (w) => {
    const a = readBlob(w).rows.find((/** @type {{label: string}} */ r) => r.label === 'attention');
    assert.ok(a.detail.includes('refinement ranking dark'), a.detail);
  });

  define(/^a sidecar blob written by a successful refresh$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.blobBefore = fs.readFileSync(blobPath(w), 'utf8');
  });

  define(/^a refresh fails partway through$/, async (w) => {
    const dir = path.join(w.dir, 'journal');
    fs.mkdirSync(dir, { recursive: true });
    w.journalPath = path.join(dir, 'treecontext.db');
    fs.writeFileSync(w.journalPath, 'these bytes are not a sqlite database');
    w.clock = new Date(w.clock.getTime() + 5 * 60 * 1000);
    w.failedAt = w.clock;
    await W.runRefresh(w);
    assert.ok(w.error, 'expected the refresh to fail');
  });

  define(/^the blob states that the last refresh failed$/, (w) => {
    const b = readBlob(w);
    assert.strictEqual(b.status, 'broken');
    assert.ok(b.message.includes('refresh failed'), `message: ${b.message}`);
  });

  define(/^the blob carries no counts from the earlier picture$/, (w) => {
    assert.deepStrictEqual(readBlob(w).rows, []);
  });

  define(/^the blob's stated time is the failed attempt's time$/, (w) => {
    const expected = new Date(w.failedAt);
    const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
    const at = `${expected.getUTCFullYear()}-${p(expected.getUTCMonth() + 1)}-${p(expected.getUTCDate())} `
      + `${p(expected.getUTCHours())}:${p(expected.getUTCMinutes())}`;
    assert.strictEqual(readBlob(w).basis.at, at);
  });

  define(/^a second refresh is refused while the first still stands$/, async (w) => {
    fs.rmSync(path.join(w.dir, 'features'), { recursive: true, force: true });
    await W.runRefresh(w);
    assert.ok(w.error instanceof gt.GtRefusal, `expected refusal, got ${w.error}`);
  });

  define(/^the blob is byte-identical to the one the successful refresh wrote$/, (w) => {
    assert.strictEqual(fs.readFileSync(blobPath(w), 'utf8'), w.blobBefore);
  });

  define(/^a sidecar blob written by a refresh$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
    w.blobBefore = fs.readFileSync(blobPath(w), 'utf8');
  });

  define(/^a new refresh runs over byte-identical sources$/, async (w) => {
    w.clock = new Date(w.clock.getTime() + 60 * 60 * 1000);
    await W.runRefresh(w);
    assert.ok(w.result, `second refresh failed: ${w.error}`);
  });

  define(/^the two blobs differ only in the stated refresh time$/, (w) => {
    const before = JSON.parse(w.blobBefore);
    const after = readBlob(w);
    assert.notStrictEqual(after.basis.at, before.basis.at, 'refresh time did not move');
    before.basis.at = '';
    after.basis.at = '';
    assert.deepStrictEqual(after, before, 'more than the refresh time changed');
  });

  define(/^the blob is rewritten by a new refresh$/, async (w) => {
    w.clock = new Date(w.clock.getTime() + 60 * 60 * 1000);
    await W.runRefresh(w);
    assert.ok(w.result, `rewrite refresh failed: ${w.error}`);
  });

  define(/^a reader sees either the old blob or the new one, whole$/, (w) => {
    // The write is aside-then-rename (the design tier pins the mechanism);
    // here: the final file parses whole and no write-aside residue remains.
    const b = readBlob(w);
    assert.strictEqual(b.v, 1);
    const leftovers = fs.readdirSync(path.join(w.dir, '.gherkin-trace'))
      .filter((f) => f.includes('.tmp.'));
    assert.deepStrictEqual(leftovers, [], 'write-aside residue remains');
  });
};
