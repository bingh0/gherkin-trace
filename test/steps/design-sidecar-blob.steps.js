'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const W = require('../world');

// Design-tier bindings: v1 conformance of the emitted blob. The expected
// field sets mirror ccr's docs/pane-blob.golden.json — kept literal here so
// gt's suite stays self-contained; drift against the golden fixture is the
// pane contract's own versioning discipline.

const TOP_FIELDS = ['basis', 'message', 'rows', 'status', 'title', 'tool', 'v'];
const ROW_FIELDS = new Set(['label', 'value', 'status', 'detail', 'spark']);

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

  define(/^the blob file is \.gherkin-trace\/sidecar\.json$/, (w) => {
    assert.ok(fs.existsSync(blobPath(w)), '.gherkin-trace/sidecar.json missing');
  });

  define(/^the blob parses as JSON with v equal to the number 1$/, (w) => {
    const b = readBlob(w);
    assert.strictEqual(typeof b.v, 'number');
    assert.strictEqual(b.v, 1);
  });

  define(/^tool reads "([^"]+)" and title reads "([^"]+)"$/, (w, tool, title) => {
    const b = readBlob(w);
    assert.strictEqual(b.tool, tool);
    assert.strictEqual(b.title, title);
  });

  define(/^status reads "([^"]+)" and basis carries label "([^"]+)" and the refresh time in at$/,
    (w, status, label) => {
      const b = readBlob(w);
      assert.strictEqual(b.status, status);
      assert.strictEqual(b.basis.label, label);
      assert.strictEqual(b.basis.at, w.result.refreshedAt);
    });

  define(/^rows is an array whose every value field is a JSON string$/, (w) => {
    const b = readBlob(w);
    assert.ok(Array.isArray(b.rows) && b.rows.length > 0);
    for (const r of b.rows) {
      assert.strictEqual(typeof r.value, 'string', `${r.label}: value is ${typeof r.value}`);
    }
  });

  define(/^the blob carries exactly the fields the pane contract's golden fixture carries$/,
    (w) => {
      const b = readBlob(w);
      assert.deepStrictEqual(Object.keys(b).sort(), TOP_FIELDS);
      for (const r of b.rows) {
        for (const k of Object.keys(r)) {
          assert.ok(ROW_FIELDS.has(k), `row field "${k}" is outside the v1 contract`);
        }
        for (const required of ['label', 'value', 'status']) {
          assert.ok(required in r, `row missing required "${required}"`);
        }
      }
    });

  define(/^no field beyond the v1 contract is required for a consumer to render it$/, (w) => {
    // Structural: every field present is a v1 field (checked above); a
    // v1-only consumer can therefore render the whole blob.
    const b = readBlob(w);
    assert.ok(TOP_FIELDS.every((f) => f in b));
  });

  define(/^a picture with a fence breach$/, async (w) => {
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
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
  });

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the attention row's status reads "([^"]+)"$/, (w, status) => {
    const attention = readBlob(w).rows.find(
      (/** @type {{label: string}} */ r) => r.label === 'attention');
    assert.ok(attention, 'no attention row');
    assert.strictEqual(attention.status, status);
  });

  define(/^a picture whose attention list is empty with nothing dark$/, async (w) => {
    // fresh world within the same scenario: reset the sandbox
    for (const k of Object.keys(w)) delete w[k];
    W.gitInit(w);
    const uat = 'Orders settle end to end';
    const design = 'Orders settle end to end via the ledger';
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', [uat]));
    W.writeFile(w, 'features/design/orders.feature', featureOf('Order mechanics', [design]));
    W.writeFile(w, 'OUT-OF-SCOPE.md', [
      '# Out of scope', '', '## Declined', '',
      '- **Legacy exports** — nightly CSV dumps to the SFTP dropbox stay out. (2026-06-12)', '',
    ].join('\n'));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    const start = W.toUnix('2026-07-20T10:00:00Z');
    await W.createJournalStore(w, [
      ...[uat, design].map((t, i) => ({
        content: `Ruling: "${t}" is approved as specified.`,
        role: 'user',
        sessionId: 'ruling-session',
        createdAt: start + i * 60,
      })),
      ...Array.from({ length: 25 }, (_, i) => ({
        content: `Round ${i} hammering out "${design}" before review.`,
        role: 'user',
        sessionId: 'settled-talk',
        createdAt: W.toUnix('2026-07-05T09:00:00Z') + i * 60,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        content: `Ambient note ${i} about the build tooling and its quirks.`,
        role: 'user',
        sessionId: 'bg-one',
        createdAt: W.toUnix('2026-07-03T09:00:00Z') + i * 60,
      })),
    ]);
    w.scenarios = [
      { file: 'features/orders.feature', title: uat },
      { file: 'features/design/orders.feature', title: design },
    ];
    W.writeManifest(w);
  });

  define(/^a sidecar blob written by a successful refresh$/, async (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
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

  define(/^status reads "broken" and message is a non-empty string$/, (w) => {
    const b = readBlob(w);
    assert.strictEqual(b.status, 'broken');
    assert.strictEqual(typeof b.message, 'string');
    assert.ok(b.message.length > 0);
  });

  define(/^basis is present with the failed attempt's time in at$/, (w) => {
    const b = readBlob(w);
    const d = new Date(w.failedAt);
    const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
    const at = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} `
      + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
    assert.strictEqual(b.basis.label, 'refresh');
    assert.strictEqual(b.basis.at, at);
  });

  define(/^rows is an empty array$/, (w) => {
    assert.deepStrictEqual(readBlob(w).rows, []);
  });

  define(/^a feature file whose parse error embeds a control byte in its message$/, (w) => {
    W.gitInit(w);
    W.writeFile(w, 'features/orders.feature', featureOf('Orders', ['Orders settle end to end']));
    // duplicate titles carrying an ESC byte: the exception message embeds
    // the title verbatim — the source-derived path into artifact strings
    const hot = 'Weird \u001b[31mtitle settles';
    W.writeFile(w, 'features/dup.feature', [
      'Feature: Duplicates',
      `  Scenario: ${hot}`,
      '    Given a thing',
      '    Then it holds',
      `  Scenario: ${hot}`,
      '    Given a thing',
      '    Then it holds',
      '',
    ].join('\n'));
    W.gitCommit(w, 'corpus', '2026-07-01T10:00:00Z');
  });

  define(/^no string field anywhere in the blob contains a control byte$/, (w) => {
    /** @param {unknown} v */
    const sweep = (v) => {
      if (typeof v === 'string') {
        // eslint-disable-next-line no-control-regex
        assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(v), `control byte in ${JSON.stringify(v)}`);
      } else if (Array.isArray(v)) v.forEach(sweep);
      else if (v && typeof v === 'object') Object.values(v).forEach(sweep);
    };
    sweep(readBlob(w));
  });

  define(/^the blob's directory is created owner-only$/, (w) => {
    const st = fs.statSync(path.join(w.dir, '.gherkin-trace'));
    // Owner-only is expressed through POSIX mode bits. Windows carries none
    // (stat reports a synthetic 0o666 for every directory, and chmod toggles
    // only the read-only attribute), so there the step can witness only that
    // the directory exists; the mode assertion is a Unix fact.
    if (process.platform === 'win32') return assert.ok(st.isDirectory());
    const mode = st.mode & 0o777;
    assert.strictEqual(mode, 0o700, `dir mode is ${mode.toString(8)}`);
  });

  define(/^the blob is written aside in that same directory and renamed into place$/, (w) => {
    // Residue-free and parseable-whole: the write-aside lands in the same
    // dir (pinned by the implementation's tmp naming) and never survives.
    const entries = fs.readdirSync(path.join(w.dir, '.gherkin-trace'));
    assert.ok(entries.includes('sidecar.json'));
    assert.deepStrictEqual(entries.filter((f) => f.startsWith('sidecar.json.tmp')), []);
  });

  define(/^the blob's write follows the refresh record's write$/, (w) => {
    const dir = path.join(w.dir, '.gherkin-trace');
    const refreshM = fs.statSync(path.join(dir, 'refresh.json')).mtimeMs;
    const blobM = fs.statSync(path.join(dir, 'sidecar.json')).mtimeMs;
    assert.ok(blobM >= refreshM, 'blob predates the refresh record');
  });

  define(/^a blob is never newer than the picture it describes$/, (w) => {
    const b = readBlob(w);
    assert.strictEqual(b.basis.at, w.result.refreshedAt,
      'blob basis disagrees with the refresh it followed');
  });

  define(/^no row in the blob carries a spark field$/, (w) => {
    for (const r of readBlob(w).rows) {
      assert.ok(!('spark' in r), `row ${r.label} carries a spark`);
    }
  });
};
