'use strict';
const assert = require('node:assert');
const W = require('../world');

// Heat worlds need a density DISTRIBUTION for the natural-break cut, so
// each named region sits alongside small background sessions the way real
// journals always carry ambient chatter.

const TITLE = 'Refund a cancelled order end to end';

/** @param {string} title @param {string} [thenStep] */
function refundsFeature(title, thenStep = 'the refund is issued in full') {
  return [
    'Feature: Refunds',
    `  Scenario: ${title}`,
    '    Given a cancelled order',
    `    Then ${thenStep}`,
    '',
  ].join('\n');
}

/**
 * `count` prose entries in one session, spread minutely from `fromIso`.
 * @param {string} session @param {number} count @param {string} fromIso
 * @param {(i: number) => string} contentOf
 */
function sessionEntries(session, count, fromIso, contentOf) {
  const start = W.toUnix(fromIso);
  return Array.from({ length: count }, (_, i) => ({
    content: contentOf(i),
    role: 'user',
    sessionId: session,
    createdAt: start + i * 60,
  }));
}

/** small ambient sessions so a natural break can exist */
function background() {
  return [
    ...sessionEntries('bg-one', 2, '2026-07-03T09:00:00Z',
      (i) => `Ambient note ${i} about the build tooling and nothing else.`),
    ...sessionEntries('bg-two', 3, '2026-07-04T09:00:00Z',
      (i) => `Ambient note ${i} about the release checklist and dates.`),
  ];
}

/** @param {Record<string, any>} w @param {string} session */
function regionNode(w, session) {
  const d = W.dump(w);
  const node = d.nodes.find((n) => n.kind === 'region'
    && /** @type {{sessionId: string}} */ (n.data).sessionId === session);
  assert.ok(node, `region for session ${session} missing from picture`);
  return /** @type {{data: Record<string, any>}} */ (node);
}

/** @param {import('gherkin-node-test').StepRegistry} reg */
module.exports = (reg) => {
  const define = W.stringSteps(reg);
  define(/^a region with (\d+) journal entries before its last spec change and none after$/,
    async (w, count) => {
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', refundsFeature(TITLE));
      W.gitCommit(w, 'initial', '2026-07-01T10:00:00Z');
      await W.createJournalStore(w, [
        ...sessionEntries('region-a', Number(count), '2026-07-02T09:00:00Z',
          (i) => `Round ${i} of hammering out "${TITLE}" — gateway sandbox details.`),
        ...background(),
      ]);
      W.writeFile(w, 'features/refunds.feature', refundsFeature(TITLE, 'the refund is issued minus fees'));
      W.gitCommit(w, 'spec change ending the discussion', '2026-07-10T10:00:00Z');
      w.session = 'region-a';
    });

  define(/^a refresh runs$/, async (w) => {
    await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the region is classified (settled|contested|uncaptured|unexamined)$/,
    (w, state) => {
      assert.strictEqual(regionNode(w, w.session).data.state, state);
    });

  define(/^the region carries no flag in the report$/, (w) => {
    assert.strictEqual(regionNode(w, w.session).data.flag, null);
  });

  define(/^a region with heavy discussion whose last spec change is dated "([^"]+)"$/,
    async (w, date) => {
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', refundsFeature(TITLE));
      W.gitCommit(w, 'initial', '2026-07-01T10:00:00Z');
      W.writeFile(w, 'features/refunds.feature', refundsFeature(TITLE, 'the refund is issued minus fees'));
      W.gitCommit(w, 'last spec change', `${date}T10:00:00Z`);
      w.session = 'region-a';
      w.specChange = date;
    });

  define(/^journal discussion of that region continuing through "([^"]+)"$/,
    async (w, through) => {
      // 20 entries: half before the spec change, half after, ending at
      // `through` — discussion that outlived the spec.
      const end = W.toUnix(`${through}T10:00:00Z`);
      const entries = Array.from({ length: 20 }, (_, i) => ({
        content: `Still going on "${TITLE}" — round ${i} of the same argument.`,
        role: 'user',
        sessionId: 'region-a',
        createdAt: end - (19 - i) * 86400 / 2,
      }));
      await W.createJournalStore(w, [...entries, ...background()]);
    });

  define(/^the region carries a hot flag in the report$/, (w) => {
    assert.strictEqual(regionNode(w, w.session).data.flag, 'hot');
  });

  define(/^a region with (\d+) journal entries and no scenarios$/, async (w, count) => {
    W.gitInit(w);
    W.writeFile(w, 'features/refunds.feature', refundsFeature(TITLE));
    W.gitCommit(w, 'initial', '2026-07-01T10:00:00Z');
    await W.createJournalStore(w, [
      ...sessionEntries('uncaptured-talk', Number(count), '2026-07-05T09:00:00Z',
        (i) => `Partial capture retries keep coming up, round ${i} — still no spec anywhere.`),
      ...background(),
    ]);
    w.session = 'uncaptured-talk';
  });

  define(/^the region carries the hottest flag in the report$/, (w) => {
    assert.strictEqual(regionNode(w, w.session).data.flag, 'hottest');
    // Uncaptured requires HEAVY discussion: the ambient background sessions
    // must not ride along as hottest.
    for (const bg of ['bg-one', 'bg-two']) {
      const node = regionNode(w, bg);
      assert.strictEqual(node.data.state, 'unexamined',
        `background session ${bg} misclassified as ${node.data.state}`);
    }
  });

  define(/^a region with (\d+) journal entries and (\d+) unreviewed scenario$/,
    async (w, count, _scenarios) => {
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', refundsFeature(TITLE));
      W.gitCommit(w, 'initial', '2026-07-01T10:00:00Z');
      await W.createJournalStore(w, [
        ...sessionEntries('thin-talk', Number(count), '2026-07-05T09:00:00Z',
          (i) => `A first look ${i} at "${TITLE}" — sketchy still.`),
        ...sessionEntries('heavy-elsewhere', 30, '2026-07-06T09:00:00Z',
          (i) => `Deep unrelated dive ${i} into the migration tooling weeds.`),
      ]);
      w.session = 'thin-talk';
    });

  define(/^the region is reported as unknown rather than hot$/, (w) => {
    const data = regionNode(w, w.session).data;
    assert.strictEqual(data.flag, 'unknown');
    assert.notStrictEqual(data.state, 'contested');
    assert.notStrictEqual(data.state, 'uncaptured');
  });

  define(/^a region with (\d+) journal entries and (\d+) reviewed scenarios unchanged since their rulings$/,
    async (w, count, scenarios) => {
      await reviewedRegionWorld(w, Number(count), Number(scenarios), false);
    });

  define(/^a region with (\d+) journal entries and (\d+) scenarios marked reviewed-then-changed$/,
    async (w, count, scenarios) => {
      await reviewedRegionWorld(w, Number(count), Number(scenarios), true);
    });

  define(/^the region is classified quiet$/, (w) => {
    assert.strictEqual(regionNode(w, w.session).data.state, 'quiet');
  });

  define(/^the region is not classified quiet$/, (w) => {
    assert.notStrictEqual(regionNode(w, w.session).data.state, 'quiet');
  });

  define(/^(?:five )?regions with ([\d,\s]+(?:and \d+)?) journal entries$/,
    async (w, list) => {
      const counts = /** @type {RegExpMatchArray} */ (list.match(/\d+/g)).map(Number);
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', refundsFeature(TITLE));
      W.gitCommit(w, 'initial', '2026-07-01T10:00:00Z');
      /** @type {any[]} */
      const entries = [];
      counts.forEach((count, r) => {
        entries.push(...sessionEntries(`region-${String.fromCharCode(97 + r)}`, count,
          '2026-07-05T09:00:00Z',
          (i) => `Topic ${r} discussion item ${i} about its own separate corner.`));
      });
      await W.createJournalStore(w, entries);
      w.counts = counts;
    });

  define(/^only the regions with (\d+) and (\d+) entries are classified heavy$/,
    (w, a, b) => {
      const expectHeavy = new Set([Number(a), Number(b)]);
      const d = W.dump(w);
      const regions = d.nodes.filter((n) => n.kind === 'region')
        .map((n) => /** @type {{entryCount: number, heavy: boolean}} */ (n.data));
      assert.strictEqual(regions.length, w.counts.length);
      for (const r of regions) {
        assert.strictEqual(r.heavy, expectHeavy.has(r.entryCount),
          `region with ${r.entryCount} entries: heavy=${r.heavy}`);
      }
    });

  define(/^no region is classified heavy$/, (w) => {
    const d = W.dump(w);
    for (const n of d.nodes.filter((x) => x.kind === 'region')) {
      assert.strictEqual(/** @type {{heavy: boolean}} */ (n.data).heavy, false);
    }
  });

  define(/^the report states that no natural break exists and heat classification is withheld$/,
    (w) => {
      assert.ok(w.result.notes.some((/** @type {string} */ n) =>
        n.includes('no natural break') && n.includes('withheld')),
        'the report does not state the withholding');
      assert.strictEqual(W.dump(w).meta.heatWithheld, true);
    });

  define(/^a region of discussion about refund handling correlated to (\d+) scenarios$/,
    async (w, n) => {
      assert.strictEqual(Number(n), 2);
      const second = 'Refund a partial order cleanly';
      W.gitInit(w);
      W.writeFile(w, 'features/refunds.feature', [
        'Feature: Refunds',
        `  Scenario: ${TITLE}`,
        '    Given a cancelled order',
        '    Then the refund is issued in full',
        `  Scenario: ${second}`,
        '    Given a partially shipped order',
        '    Then the unshipped part is refunded',
        '',
      ].join('\n'));
      W.gitCommit(w, 'initial', '2026-07-01T10:00:00Z');
      await W.createJournalStore(w, [
        ...sessionEntries('refund-handling', 6, '2026-07-05T09:00:00Z', (i) =>
          i % 2 === 0
            ? `Refund handling round ${i}: edge cases in "${TITLE}".`
            : `Refund handling round ${i}: how "${second}" splits the ledger.`),
        ...background(),
      ]);
      w.session = 'refund-handling';
      w.expectedTitles = [TITLE, second];
    });

  define(/^the report is emitted$/, async (w) => {
    // Report emission proper lands in the reporting layer; until then the
    // picture's region presentation IS the report fragment under test.
    if (!w.result) await W.runRefresh(w);
    assert.ok(w.result, `refresh failed: ${w.error}`);
  });

  define(/^the region is presented by terms drawn from its discussion$/, (w) => {
    const terms = regionNode(w, w.session).data.terms;
    assert.ok(Array.isArray(terms) && terms.length > 0, 'region has no terms');
    // The discussion's own topical vocabulary must surface — junk terms
    // cannot produce these two.
    assert.ok(
      (terms.includes('refund') && terms.includes('handling'))
      || (terms.includes('partial') && terms.includes('capture')),
      `terms ${JSON.stringify(terms)} are not the discussion's vocabulary`);
  });

  define(/^the (\d+) correlated scenarios are named alongside it$/, (w, n) => {
    const correlated = regionNode(w, w.session).data.correlated;
    assert.strictEqual(correlated.length, Number(n));
    const titles = correlated.map((/** @type {{title: string}} */ c) => c.title).sort();
    assert.deepStrictEqual(titles, [...w.expectedTitles].sort());
  });

  define(/^the region cites its journal entries as evidence$/, (w) => {
    const data = regionNode(w, w.session).data;
    // Exactly one citation per entry, no fabrication, no double-counting.
    assert.strictEqual(data.entryIds.length, data.entryCount,
      'citations do not match the entry count');
    assert.strictEqual(new Set(data.entryIds).size, data.entryIds.length,
      'duplicate citations');
    // The excerpts are the WORLD's own words, chronologically first —
    // fabricated ids cannot produce these.
    assert.ok(data.sampleExcerpts[0].includes('round 0')
      || data.sampleExcerpts[0].includes('coming up, round 0'),
      `first excerpt is not the first entry: ${data.sampleExcerpts[0]}`);
  });
};

/**
 * Shared world: a small discussion region around `scenarios` ruled
 * scenarios; `lapsed` additionally changes their bodies after the rulings.
 * @param {Record<string, any>} w @param {number} count @param {number} scenarios @param {boolean} lapsed
 */
async function reviewedRegionWorld(w, count, scenarios, lapsed) {
  const W2 = W;
  W2.gitInit(w);
  const titles = Array.from({ length: scenarios }, (_, i) => `Ledger case l${i + 1} settles fully`);
  const featureOf = (/** @type {string} */ suffix) => [
    'Feature: Ledger',
    ...titles.flatMap((t) => [
      `  Scenario: ${t}`,
      `    Given the ledger case behind "${t}"`,
      `    Then it settles${suffix}`,
    ]),
    '',
  ].join('\n');
  W2.writeFile(w, 'features/ledger.feature', featureOf(''));
  W2.gitCommit(w, 'initial', '2026-07-01T10:00:00Z');
  await W2.createJournalStore(w, [
    ...sessionEntries('calm-talk', count, '2026-07-02T09:00:00Z',
      (i) => `Calm pass ${i} over "${titles[i % titles.length]}" before review.`),
    ...titles.map((t, i) => ({
      content: `Ruling: "${t}" is approved as specified.`,
      role: 'user',
      sessionId: 'ruling-session',
      createdAt: W2.toUnix('2026-07-05T10:00:00Z') + i * 60,
    })),
    ...sessionEntries('heavy-elsewhere', 30, '2026-07-06T09:00:00Z',
      (i) => `Deep unrelated dive ${i} into the migration tooling weeds.`),
  ]);
  if (lapsed) {
    W2.writeFile(w, 'features/ledger.feature', featureOf(' after the batch run'));
    W2.gitCommit(w, 'post-ruling change', '2026-07-08T10:00:00Z');
  }
  w.session = 'calm-talk';
}
