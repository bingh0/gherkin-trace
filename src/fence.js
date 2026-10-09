'use strict';
const { compareCodePoints, humanAuthored } = require('./util');

// The fence — negative intent, first-class. The out-of-scope file is the
// SOLE fence authority (mining fence rulings from the journal is itself
// fenced): positive intent is mined, negative intent is transcribed.
// Reaffirmation and reversal are edits to the file; an entry's effective
// date is the latest date its text carries.
//
// Fence-under-pressure fires on USER-authored discussion only (ruled
// 2026-08-01): the flag detects the owner's own interest reopening their
// own ruling; agent chatter must not ring the reconsider bell. Agent drift
// into fenced territory is caught by breach detection, at the act.
//
// Matching (implementation-tier v2, thresholds documented): tokens are
// light-stemmed; a journal entry or region matches a fence when it carries
// every TOPIC token. A scenario BREACHES when it carries every topic token
// (clearly inside the named territory); it is a POSSIBLE breach when it
// carries at least half the topic tokens AND at least two of them. Tiers
// are topic-anchored only — the full-text-overlap channel is reported as
// evidence but assigns no tier (v1 ruled it in at >= 0.2 of the smaller
// side; on the self-corpus that put 96 of 129 scenarios in the possible
// band — shared house vocabulary, not arguable territory — and one-token
// matches from short topics were the residue after dropping it; both
// halves of the v2 rule ruled D1, 2026-08-11). The two-token consequence
// is deliberate: a two-token topic has no arguable band — two shared
// tokens IS the territory. (v1's adversarial catch stands: scoring
// against the full entry text alone let verbose fence entries dilute
// every real breach below threshold — the breach tier was dead.)
//
// Guardians (ruled D2, 2026-08-11): a Declined entry may name the
// scenarios that ENFORCE it — `Guarded by: "<title>", "<title>"` in the
// entry body — because an enforcing scenario carries the fence's
// vocabulary by construction and bag-of-words cannot see the "never".
// A named guardian is exempt from that entry's breach tiers and cited as
// a guardian instead: ratified suppression citing its ruling, the same
// shape as fenced silence. Unlisted lookalikes still fire — the safe
// default holds. Suppression of coverage flags happens only on a clear
// match: wrong suppression is manufactured silence.

const TOPIC_POSSIBLE = 0.5;
const TOPIC_MIN_SHARED = 2;

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are',
  'for', 'on', 'with', 'that', 'it', 'as', 'be', 'was', 'were', 'any', 'its']);

/**
 * @typedef {{
 *   topic: string,
 *   text: string,
 *   dates: string[],
 *   effectiveDate: string | null,
 *   firstDate: string | null,
 *   line: number,
 *   guardians: string[],
 * }} FenceEntry
 */

/**
 * Parse the out-of-scope file. Only `## Declined` entries are active
 * fences; Reversed and Deferred sections are recorded history, not fences.
 * @param {string} text @returns {FenceEntry[]}
 */
function parseFence(text) {
  /** @type {FenceEntry[]} */
  const entries = [];
  let section = '';
  /** @type {FenceEntry | null} */
  let current = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = /^#+\s+(.+)$/.exec(line);
    if (heading) {
      section = heading[1].trim().toLowerCase();
      current = null;
      continue;
    }
    const bullet = /^- \*\*(.+?)\*\*/.exec(line);
    // A section is Declined territory when its heading IS "Declined" or
    // opens with it ("Declined — spec dilution family (…)"): dated
    // sub-sections keep the document navigable without going invisible to
    // the reader that enforces them.
    if (bullet && /^declined\b/.test(section)) {
      current = {
        topic: bullet[1].replace(/~~/g, '').trim(),
        text: line,
        dates: [],
        effectiveDate: null,
        firstDate: null,
        line: i + 1,
        guardians: [],
      };
      entries.push(current);
      continue;
    }
    if (bullet) {
      current = null;
      continue;
    }
    if (current !== null && /^\s+\S/.test(line)) {
      current.text += `\n${line}`;
    } else if (current !== null && line.trim() === '') {
      current = null;
    }
  }
  for (const e of entries) {
    // Dates come from the entry's trailing parenthetical only — the
    // transcription convention. A date quoted in the reason prose ("per the
    // 2026-09-01 roadmap") must not masquerade as a ruling or reaffirmation.
    const paren = /\(([^)]*)\)\s*$/.exec(e.text.replace(/\s+/g, ' ').trim());
    e.dates = (paren === null ? [] : (paren[1].match(/\d{4}-\d{2}-\d{2}/g) ?? [])).slice().sort();
    e.firstDate = e.dates[0] ?? null;
    e.effectiveDate = e.dates[e.dates.length - 1] ?? null;
    // Guardians are transcribed by title: `Guarded by: "<title>", "<title>"`
    // anywhere in the entry body (before the trailing date parenthetical,
    // which stays the sole date authority).
    const guarded = /guarded by:((?:\s*"[^"]+"[,;]?(?:\s+and)?)+)/i
      .exec(e.text.replace(/\s+/g, ' '));
    e.guardians = guarded === null ? []
      : [...guarded[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }
  return entries;
}

/**
 * Light stemmer: enough to unite refunds/refunding/refunded and
 * queries/query without mangling pass→pas (double-s protected) or leaving
 * queries≠query mismatches (ies→y first).
 * @param {string} t
 */
function stem(t) {
  let s = t;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}

/** @param {string} text @returns {Set<string>} */
function tokens(text) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    out.add(stem(raw));
  }
  return out;
}

/** @param {FenceEntry} fence @returns {Set<string>} */
function topicTokens(fence) {
  return tokens(fence.topic);
}

/**
 * Does this prose carry every topic token? The rule for journal entries
 * and regions, whose texts are short relative to the fence's.
 * @param {FenceEntry} fence @param {string} prose
 */
function mentionsTopic(fence, prose) {
  const topic = topicTokens(fence);
  if (topic.size === 0) return false;
  const t = tokens(prose);
  return [...topic].every((x) => t.has(x));
}

/**
 * The breach discriminator: how much of the fence's TOPIC a scenario
 * carries, plus how much of the full fence vocabulary overlaps the
 * scenario's, normalized by the smaller side.
 * @param {FenceEntry} fence @param {string} scenarioText
 * @returns {{ topicContainment: number, textOverlap: number, kind: 'breach' | 'possible' | null }}
 */
function breachMatch(fence, scenarioText) {
  const topic = topicTokens(fence);
  const s = tokens(scenarioText);
  const topicShared = [...topic].filter((x) => s.has(x)).length;
  const topicContainment = topic.size === 0 ? 0 : topicShared / topic.size;
  const full = tokens(`${fence.topic} ${fence.text}`);
  const fullShared = [...full].filter((x) => s.has(x)).length;
  const textOverlap = full.size === 0 || s.size === 0
    ? 0 : fullShared / Math.min(full.size, s.size);
  /** @type {'breach' | 'possible' | null} */
  let kind = null;
  if (topic.size > 0 && topicContainment === 1) kind = 'breach';
  else if (topicShared >= TOPIC_MIN_SHARED && topicContainment >= TOPIC_POSSIBLE) {
    kind = 'possible';
  }
  return {
    topicContainment: round3(topicContainment),
    textOverlap: round3(textOverlap),
    kind,
  };
}

/** @param {number} n */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Compute all fence signals against the assembled picture inputs.
 * @param {{
 *   fences: FenceEntry[],
 *   corpus: Array<{key: string, file: string, title: string, steps: string[]}>,
 *   allEntries: import('./review').MinedEntry[],
 *   timelines: Map<string, import('./history').Timeline>,
 * }} input
 * @returns {{
 *   pressures: Map<string, {entries: Array<{tcNodeId: string, date: string, excerpt: string}>, ask: string}>,
 *   breaches: Array<{scenarioKey: string, fenceTopic: string, kind: 'breach' | 'possible', predates: boolean, score: number}>,
 *   guardianships: Array<{scenarioKey: string, fenceTopic: string, fenceLine: number}>,
 *   dateless: string[],
 * }}
 */
function computeFenceSignals({ fences, corpus, allEntries, timelines }) {
  const { jkey } = require('./util');
  const { isoOf } = require('./review');

  /** @type {Map<string, {entries: Array<{tcNodeId: string, date: string, excerpt: string}>, ask: string}>} */
  const pressures = new Map();
  /** @type {string[]} */
  const dateless = [];
  for (const fence of fences) {
    if (fence.effectiveDate === null) {
      // No date in the trailing parenthetical: pressure detection cannot
      // order discussion against the ruling — named, never silent.
      dateless.push(fence.topic);
      continue;
    }
    const after = allEntries
      .filter((e) => humanAuthored(e)
        && isoOf(e.createdAt) > `${fence.effectiveDate}T23:59:59Z`
        && mentionsTopic(fence, e.content))
      .map((e) => ({ tcNodeId: e.tcNodeId, date: isoOf(e.createdAt), excerpt: e.excerpt }))
      .sort((a, b) => compareCodePoints(a.date, b.date));
    if (after.length > 0) {
      pressures.set(fence.topic, {
        entries: after,
        ask: `the fence on "${fence.topic}" (ruled ${fence.effectiveDate}) is under discussion again — `
          + 'reconsider the ruling or reaffirm it in the out-of-scope file.',
      });
    }
  }

  /** @type {Array<{scenarioKey: string, fenceTopic: string, kind: 'breach' | 'possible', predates: boolean, score: number}>} */
  const breaches = [];
  /** @type {Array<{scenarioKey: string, fenceTopic: string, fenceLine: number}>} */
  const guardianships = [];
  for (const fence of fences) {
    for (const c of corpus) {
      const m = breachMatch(fence, `${c.title} ${c.steps.join(' ')}`);
      if (m.kind === null) continue;
      if (fence.guardians.includes(c.title)) {
        // A named guardian is exempt from this entry's breach tiers and
        // cited instead — ratified suppression, citing its ruling.
        guardianships.push({ scenarioKey: c.key, fenceTopic: fence.topic, fenceLine: fence.line });
        continue;
      }
      const tl = timelines.get(jkey(c.file, c.title));
      const created = tl?.events.find((e) => e.event === 'created' && e.date !== '')?.date ?? null;
      breaches.push({
        scenarioKey: c.key,
        fenceTopic: fence.topic,
        kind: m.kind,
        predates: created !== null && fence.firstDate !== null
          && created < `${fence.firstDate}T00:00:00Z`,
        score: m.topicContainment,
      });
    }
  }
  breaches.sort((a, b) => compareCodePoints(a.scenarioKey, b.scenarioKey)
    || compareCodePoints(a.fenceTopic, b.fenceTopic));
  guardianships.sort((a, b) => compareCodePoints(a.scenarioKey, b.scenarioKey)
    || compareCodePoints(a.fenceTopic, b.fenceTopic));

  return { pressures, breaches, guardianships, dateless: dateless.sort(compareCodePoints) };
}

module.exports = { parseFence, computeFenceSignals, mentionsTopic };
