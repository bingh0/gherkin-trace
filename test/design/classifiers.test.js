'use strict';
// Design-tier tests: implementation-vocabulary worlds for discriminators the
// UAT contract's worlds cannot falsify (adversarial gate-2 findings) — role
// discrimination, negated/interrogative ruling language, latest-negative
// rulings, natural-break distributions, and the identity attack repos.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { reviewState, healingRuling } = require('../../src/review');
const { naturalBreak } = require('../../src/heat');
const { computeFenceSignals, parseFence } = require('../../src/fence');
const { collectHistory } = require('../../src/history');
const { jkey, sha256 } = require('../../src/util');

const NOW = '2026-08-01T12:00:00Z';

/** @param {string} content @param {{role?: string, at?: number}} [o] */
function entry(content, o = {}) {
  return {
    tcNodeId: `id-${sha256(content).slice(0, 8)}`,
    createdAt: o.at ?? 1753000000,
    role: o.role ?? 'user',
    sessionId: 's1',
    content,
    excerpt: content.slice(0, 240),
  };
}

test('an agent-authored ruling never marks a scenario reviewed', () => {
  const state = reviewState(
    [entry('Ruling: "X" is approved as specified.', { role: 'assistant' })],
    undefined, NOW, ['X']);
  assert.strictEqual(state.status, null);
  assert.strictEqual(state.rulings.length, 0);
});

test('a negated ruling term is conversation, not a verdict', () => {
  const state = reviewState(
    [entry('"X" is not approved yet — needs another look.')],
    undefined, NOW, ['X']);
  assert.strictEqual(state.status, null);
});

test('a question containing ruling language is not a ruling', () => {
  const state = reviewState(
    [entry('Can you confirm "X" still passes the linter?')],
    undefined, NOW, ['X']);
  assert.strictEqual(state.status, null);
});

test('"another editing pass" does not mint a review', () => {
  const state = reviewState(
    [entry('Let us do another editing pass on "X" tomorrow.')],
    undefined, NOW, ['X']);
  assert.strictEqual(state.status, null);
});

test('a title carrying ruling vocabulary cannot rule on itself', () => {
  const title = 'The order is approved end to end';
  const state = reviewState(
    [entry(`We talked about "${title}" for an hour, nothing settled.`)],
    undefined, NOW, [title]);
  assert.strictEqual(state.status, null);
});

test('the latest of conflicting rulings decides — negative last means not reviewed', () => {
  const state = reviewState([
    entry('Ruling: "X" is approved.', { at: 1753000000 }),
    entry('Ruling: "X" is declined after the incident.', { at: 1753100000 }),
  ], undefined, NOW, ['X']);
  assert.strictEqual(state.status, null);
  assert.strictEqual(state.ruling?.polarity, 'negative');
  assert.strictEqual(state.rulings.length, 2);
});

test('conflicting rulings at the same instant fall conservative', () => {
  const state = reviewState([
    entry('Ruling: "X" is approved.', { at: 1753000000 }),
    entry('Ruling: "X" is declined.', { at: 1753000000 }),
  ], undefined, NOW, ['X']);
  assert.strictEqual(state.status, null);
});

test('a healing question does not heal', () => {
  const healed = healingRuling(
    [entry('Should we treat "Old title" as renamed to "New title"?')],
    { file: 'f', title: 'Old title' },
    [{ file: 'g', title: 'New title' }]);
  assert.strictEqual(healed, null);
});

test('natural break: distinct heavy cluster splits despite internal spread', () => {
  assert.strictEqual(naturalBreak([50, 30, 8, 5, 2]), 30);
  assert.strictEqual(naturalBreak([40, 38, 6, 5, 4]), 38);
});

test('natural break: near-flat and noise-level differences withhold', () => {
  assert.strictEqual(naturalBreak([3, 4, 3, 4, 3]), null);
  assert.strictEqual(naturalBreak([40, 38]), null);
  assert.strictEqual(naturalBreak([5, 4]), null);
  assert.strictEqual(naturalBreak([10]), null);
});

test('fence pressure fires on user voice only', () => {
  const fences = parseFence([
    '# Out of scope', '', '## Declined', '',
    '- **Partial refunds** — refunding half of an order is declined. (2026-06-12)', '',
  ].join('\n'));
  const agentOnly = computeFenceSignals({
    fences,
    corpus: [],
    allEntries: [entry('Maybe partial refunds deserve another look?', {
      role: 'assistant', at: Math.floor(Date.parse('2026-07-01T00:00:00Z') / 1000),
    })],
    timelines: new Map(),
  });
  assert.strictEqual(agentOnly.pressures.size, 0, 'agent chatter rang the reconsider bell');
});

test('a blatant breach of a verbose fence entry reaches the breach tier', () => {
  const fences = parseFence([
    '# Out of scope', '', '## Declined', '',
    '- **Writing to sources** — feature files, binding registries, the journal',
    '  are never modified. Read-only consumer, permanent, not revisitable.',
    '  Refusals name where the change belongs (feature edits → the normal BDD',
    '  flow, journal writes → treecontext, review status → mined only). (2026-07-24)', '',
  ].join('\n'));
  const { breaches } = computeFenceSignals({
    fences,
    corpus: [{
      key: 'scenario:x',
      file: 'features/design/x.feature',
      title: 'The tool is writing corrections back to the sources',
      steps: ['Given a drifted scenario', 'Then the corrected text is written to the source file'],
    }],
    allEntries: [],
    timelines: new Map(),
  });
  assert.strictEqual(breaches.length, 1);
  assert.strictEqual(breaches[0].kind, 'breach');
});

test('a date quoted in fence prose is not a ruling date', () => {
  const fences = parseFence([
    '# Out of scope', '', '## Declined', '',
    '- **Legacy exports** — per the 2026-09-01 roadmap these stay out. (2026-06-12)', '',
  ].join('\n'));
  assert.strictEqual(fences[0].effectiveDate, '2026-06-12');
  assert.strictEqual(fences[0].firstDate, '2026-06-12');
});

// --- identity attack repos -------------------------------------------------

/** @param {Array<{files: Record<string, string>, date: string}>} commits */
function repoWithHistory(commits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-design-'));
  const git = (/** @type {string[]} */ args, /** @type {Record<string, string>} */ env = {}) =>
    execFileSync('git', ['-C', dir, ...args], { env: { ...process.env, ...env } });
  git(['init', '-q']);
  git(['config', 'user.email', 't@t']);
  git(['config', 'user.name', 'T']);
  for (const c of commits) {
    fs.rmSync(path.join(dir, 'features'), { recursive: true, force: true });
    for (const [rel, content] of Object.entries(c.files)) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    git(['add', '-A']);
    git(['commit', '-q', '--allow-empty', '-m', 'c'], {
      GIT_AUTHOR_DATE: c.date, GIT_COMMITTER_DATE: c.date,
    });
  }
  return dir;
}

/** @param {string} title @param {string} body */
function feat(title, body) {
  return `Feature: F\n  Scenario: ${title}\n    Given ${body}\n    Then it holds\n`;
}

/** @param {string} dir current corpus snapshot from the working tree files */
function snapOf(dir) {
  /** @type {Map<string, any>} */
  const snap = new Map();
  const walk = (/** @type {string} */ d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.feature')) {
        const text = fs.readFileSync(full, 'utf8');
        const title = /Scenario: (.+)/.exec(text)?.[1] ?? '';
        const body = text.split('\n').filter((l) => /^\s{4}\S/.test(l)).map((l) => l.trim());
        const rel = path.relative(dir, full).split(path.sep).join('/');
        snap.set(jkey(rel, title), {
          file: rel, title, steps: body, bodyHash: sha256(body.join('\n')),
        });
      }
    }
  };
  if (fs.existsSync(path.join(dir, 'features'))) walk(path.join(dir, 'features'));
  return snap;
}

test('a transient unparseable commit does not manufacture false breaks', () => {
  const good = { 'features/f.feature': feat('Alpha settles', 'a stable world') };
  const dir = repoWithHistory([
    { files: good, date: '2026-07-01T10:00:00Z' },
    { files: { 'features/f.feature': 'Scenario: broken before any Feature line' }, date: '2026-07-02T10:00:00Z' },
    { files: good, date: '2026-07-03T10:00:00Z' },
  ]);
  const h = collectHistory(dir, 'features', snapOf(dir));
  assert.deepStrictEqual(h.closed, [], 'false closures manufactured');
  const tl = h.timelines.get(jkey('features/f.feature', 'Alpha settles'));
  assert.ok(tl, 'thread lost');
  assert.strictEqual(tl.events[0].date, '2026-07-01T10:00:00Z', 'creation re-dated');
  assert.ok(h.skipped.blobs > 0, 'the skipped parse was not counted');
});

test('a copy of a persisting same-body sibling is not a confirmed rename', () => {
  const dir = repoWithHistory([
    {
      files: {
        'features/g.feature': feat('Gamma settles', 'the shared body'),
        'features/h.feature': feat('Hcopy settles', 'the shared body'),
      },
      date: '2026-07-01T10:00:00Z',
    },
    {
      files: {
        'features/h.feature': feat('Hcopy settles', 'the shared body'),
        'features/d.feature': feat('Delta settles', 'the shared body'),
      },
      date: '2026-07-02T10:00:00Z',
    },
  ]);
  const h = collectHistory(dir, 'features', snapOf(dir));
  const delta = h.timelines.get(jkey('features/d.feature', 'Delta settles'));
  assert.ok(delta, 'delta thread missing');
  assert.deepStrictEqual(delta.formerTitles, [],
    'identity silently transferred from a same-body sibling copy');
  assert.ok(h.closed.some((c) => c.title === 'Gamma settles'),
    'the vanished scenario must close visibly instead');
});

test('a pure working-tree rename is not an uncommitted body change', () => {
  const dir = repoWithHistory([
    { files: { 'features/f.feature': feat('Old name', 'an untouched body') }, date: '2026-07-01T10:00:00Z' },
  ]);
  fs.writeFileSync(path.join(dir, 'features/f.feature'), feat('New name', 'an untouched body'));
  const h = collectHistory(dir, 'features', snapOf(dir));
  const tl = h.timelines.get(jkey('features/f.feature', 'New name'));
  assert.ok(tl, 'renamed thread missing');
  assert.strictEqual(tl.uncommittedChange, false,
    'a body-untouched rename read as a body change');
  assert.deepStrictEqual(tl.formerTitles, [{ file: 'features/f.feature', title: 'Old name' }]);
});
