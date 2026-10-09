'use strict';
const { humanAuthored } = require('./util');

// Review provenance — mined from ruling evidence in the journal, never
// declared. The visionary-ratified floors:
//  - reviewed is BINARY on unambiguous evidence; ambiguity lands in a
//    visible ruling-candidates list with pointers, never a score;
//  - the latest of conflicting rulings decides, both pointers carried;
//  - review expires when the body changes after the ruling
//    (reviewed-then-changed), and an unestablishable order falls the same
//    way — a false expiry is one cheap re-glance, a false "still reviewed"
//    defends drift;
//  - a post-ruling change is DECLARED when discussion of it exists in the
//    change interval, QUIET when the journal is silent there.
//
// The v1 discriminator (implementation-tier, graduation-ready): a ruling is
// a USER-authored entry that mentions the scenario's full title (any of its
// identities) and speaks in ruling terms. A user-authored ruling-shaped
// remark that does NOT name the scenario, sitting in the same session as
// discussion that does, is exactly the contract's "alongside" ambiguity —
// a candidate.

// 'pass' (bare) is deliberately absent: as a noun ("another editing pass")
// it minted false reviews in adversarial probes. Questions and negated
// terms are rejected by rulingSentence below — "can you confirm X?" and
// "not approved yet" are conversation, not verdicts.
const RULING_TERMS =
  /\b(ruled|ruling|passed|approve|approved|ratify|ratified|confirm|confirmed|reaffirm|reaffirmed|accepted|lgtm|reject|rejected|decline|declined|overturn|overturned|revert|reverted)\b/i;
const NEGATIVE_TERMS = /\b(reject|rejected|decline|declined|overturn|overturned|revert|reverted)\b/i;
const NEGATION_BEFORE = /\b(not|never|isn't|wasn't|hasn't|haven't|can't|cannot|don't|didn't|yet to)\b[^.!?]{0,40}$/i;

/**
 * Does this content contain a genuine ruling sentence? Question sentences
 * and negated terms do not count; the polarity comes from the matching
 * sentence alone.
 * @param {string} content
 * @returns {null | {polarity: 'positive' | 'negative'}}
 */
function rulingSentence(content) {
  for (const sentence of content.split(/(?<=[.!?])/)) {
    const trimmed = sentence.trim();
    if (trimmed.endsWith('?')) continue;
    const m = RULING_TERMS.exec(trimmed);
    if (m === null) continue;
    if (NEGATION_BEFORE.test(trimmed.slice(0, m.index))) continue;
    return { polarity: NEGATIVE_TERMS.test(trimmed) ? 'negative' : 'positive' };
  }
  return null;
}

/**
 * @typedef {{ tcNodeId: string, createdAt: number, role: string | null,
 *   sessionId: string | null, content: string, excerpt: string }} MinedEntry
 * @typedef {{ tcNodeId: string, date: string, polarity: 'positive' | 'negative', excerpt: string }} Ruling
 * @typedef {{
 *   status: 'reviewed' | 'reviewed-then-changed' | null,
 *   ruling: Ruling | null,
 *   rulings: Ruling[],
 *   change: null | {
 *     kind: 'committed' | 'uncommitted',
 *     date: string | null,
 *     interval: { from: string | null, to: string | null },
 *     orderEstablished: boolean,
 *     declared: boolean,
 *     sanctioned?: boolean,
 *     discussion: Array<{ tcNodeId: string, date: string }>,
 *   },
 * }} ReviewState
 */

/**
 * Compute one scenario's review state from its mention entries and its
 * identity timeline.
 *
 * The ruling test runs over the content WITH the scenario's own titles
 * stripped out first: a title that itself carries ruling vocabulary
 * ("...is approved end to end") must never turn every mention into a
 * ruling — that would let file content set review status, the exact
 * gaming channel the hand-declared-status fence exists for.
 * @param {MinedEntry[]} mentions entries mentioning any of the scenario's identities
 * @param {import('./history').Timeline | undefined} timeline
 * @param {string} refreshedAtIso ISO instant of this refresh
 * @param {string[]} titles every identity the scenario has carried
 * @returns {ReviewState}
 */
function reviewState(mentions, timeline, refreshedAtIso, titles) {
  const strip = (/** @type {string} */ content) => {
    let out = content;
    for (const t of titles) {
      out = out.split(t).join(' ');
    }
    return out;
  };
  const rulings = mentions
    .flatMap((m) => {
      if (!humanAuthored(m)) return [];
      const verdict = rulingSentence(strip(m.content));
      if (verdict === null) return [];
      return [{
        tcNodeId: m.tcNodeId,
        date: isoOf(m.createdAt),
        polarity: verdict.polarity,
        excerpt: m.excerpt,
      }];
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
      || (a.tcNodeId < b.tcNodeId ? -1 : a.tcNodeId > b.tcNodeId ? 1 : 0));

  if (rulings.length === 0) {
    return { status: null, ruling: null, rulings: [], change: null };
  }
  // Conflicting rulings at the very same instant cannot be ordered: the
  // conservative side wins — not reviewed, all pointers carried.
  const latestDate = rulings[rulings.length - 1].date;
  const atLatest = rulings.filter((r) => r.date === latestDate);
  const latest = atLatest.find((r) => r.polarity === 'negative') ?? atLatest[atLatest.length - 1];
  if (latest.polarity === 'negative') {
    // The standing ruling says no: not reviewed, pointers carried so the
    // conflict can be re-litigated.
    return { status: null, ruling: latest, rulings, change: null };
  }

  // Temporal check: did the body change (or first appear) after the ruling?
  const change = latestChange(timeline, refreshedAtIso);
  if (change === null) {
    return { status: 'reviewed', ruling: latest, rulings, change: null };
  }
  if (change.kind === 'committed' && /** @type {string} */ (change.date) < latest.date) {
    // Last change strictly predates the ruling: the ruling covered what stands.
    return { status: 'reviewed', ruling: latest, rulings, change: null };
  }
  if (change.kind === 'committed' && /** @type {string} */ (change.date) === latest.date) {
    // Same second: order unestablishable — conservative expiry, stated.
    return {
      status: 'reviewed-then-changed', ruling: latest, rulings,
      change: { ...change, orderEstablished: false },
    };
  }
  if (change.kind === 'uncommitted' && change.interval.from !== null
    && latest.date <= change.interval.from) {
    // Ruling predates the whole interval: the change is after it, established.
    return {
      status: 'reviewed-then-changed', ruling: latest, rulings,
      change: { ...change, orderEstablished: true },
    };
  }
  if (change.kind === 'uncommitted') {
    // The ruling falls inside the change interval: order unestablishable —
    // conservative expiry, and the report says why.
    return {
      status: 'reviewed-then-changed', ruling: latest, rulings,
      change: { ...change, orderEstablished: false },
    };
  }
  return {
    status: 'reviewed-then-changed', ruling: latest, rulings,
    change: { ...change, orderEstablished: true },
  };
}

/**
 * The latest body change from the timeline, with its interval and the
 * discussion found inside that interval (declared vs quiet is decided by the
 * caller attaching mentions — here we only shape the window).
 * @param {import('./history').Timeline | undefined} timeline
 * @param {string} refreshedAtIso
 * @returns {null | {kind: 'committed' | 'uncommitted', date: string | null,
 *   interval: {from: string | null, to: string | null}, orderEstablished: boolean,
 *   declared: boolean, discussion: Array<{tcNodeId: string, date: string}>}}
 */
function latestChange(timeline, refreshedAtIso) {
  void refreshedAtIso;
  if (timeline === undefined) {
    // No timeline at all: the body's whole existence is an unbounded
    // interval — a ruling cannot be shown to postdate it, but neither the
    // reverse. Callers treat this as no change evidence.
    return null;
  }
  // 'created' participates: a scenario that first APPEARED after its ruling
  // was not the body the ruling covered (adversarial catch: scoping-session
  // approval postdated by the commit that created the scenario).
  const changes = timeline.events.filter((e) => e.event === 'changed' || e.event === 'created');
  if (changes.length === 0) return null;
  const last = changes[changes.length - 1];
  /** @type {Array<import('./history').TimelineEvent>} */
  const dated = timeline.events.filter((e) => e.date !== '');
  if (last.date === '') {
    // Uncommitted: the interval runs from the last committed event to the
    // refresh moment. The open end is stored as null — the refresh time
    // must never enter picture bytes; consumers render "open as of the
    // refresh" from refresh.json.
    const from = dated.length > 0 ? dated[dated.length - 1].date : null;
    return {
      kind: 'uncommitted', date: null,
      interval: { from, to: null },
      orderEstablished: false, declared: false, discussion: [],
    };
  }
  // Committed: the interval opens at the previous dated event.
  const idx = timeline.events.indexOf(last);
  let from = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (timeline.events[i].date !== '') {
      from = timeline.events[i].date;
      break;
    }
  }
  return {
    kind: 'committed', date: last.date,
    interval: { from, to: last.date },
    orderEstablished: true, declared: false, discussion: [],
  };
}

/**
 * Attach change-interval discussion: declared iff any mention falls inside
 * the change window. The window opens at the RULING, not the previous
 * change — the ruling itself (and the discussion that led to it) cannot
 * count as discussion of a change that happened later.
 * @param {ReviewState} state @param {MinedEntry[]} mentions
 * @returns {ReviewState}
 */
function classifyChange(state, mentions) {
  if (state.change === null) return state;
  const { from, to } = state.change.interval;
  const ruled = state.ruling === null ? null : state.ruling.date;
  const lower = ruled !== null && (from === null || ruled > from) ? ruled : from;
  const discussion = mentions
    .filter((m) => {
      const d = isoOf(m.createdAt);
      // a null upper bound is an OPEN interval reaching the refresh moment
      return (lower === null || d > lower) && (to === null || d <= to);
    })
    .map((m) => ({ tcNodeId: m.tcNodeId, date: isoOf(m.createdAt) }));
  return {
    ...state,
    change: { ...state.change, declared: discussion.length > 0, discussion },
  };
}

/**
 * Ruling candidates for an unreviewed scenario: user-authored ruling-shaped
 * entries that do NOT name it, in the same session as entries that do.
 * @param {MinedEntry[]} mentions entries naming the scenario
 * @param {MinedEntry[]} sessionEntries all mined entries in the mention sessions
 * @param {string[]} titles every identity of the scenario
 * @returns {Array<{tcNodeId: string, date: string, excerpt: string}>}
 */
function rulingCandidates(mentions, sessionEntries, titles) {
  const mentionSessions = new Set(mentions.map((m) => m.sessionId).filter((s) => s !== null));
  if (mentionSessions.size === 0) return [];
  const lowered = titles.map((t) => t.toLowerCase());
  return sessionEntries
    .filter((e) => humanAuthored(e)
      && e.sessionId !== null && mentionSessions.has(e.sessionId)
      && RULING_TERMS.test(e.content)
      && !lowered.some((t) => e.content.toLowerCase().includes(t)))
    .map((e) => ({ tcNodeId: e.tcNodeId, date: isoOf(e.createdAt), excerpt: e.excerpt }))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

/**
 * Mine rename-healing rulings: a user-authored entry naming BOTH the closed
 * identity and a candidate identity in rename-confirming terms.
 * @param {MinedEntry[]} entries
 * @param {{file: string, title: string}} from
 * @param {Array<{file: string, title: string}>} candidates
 * @returns {null | {to: {file: string, title: string}, ruling: string, date: string}}
 */
function healingRuling(entries, from, candidates) {
  const confirmTerms = /\b(confirm|confirmed|rename|renamed|retitled|same scenario|is now)\b/i;
  // Latest first: the most recent ruling on the rename decides, matching
  // the latest-of-conflicting-rulings floor elsewhere. Questions and
  // negated remarks ("should we rename X to Y?" / "no, X was not renamed")
  // are conversation, not confirmations.
  const ordered = [...entries].sort((a, b) => b.createdAt - a.createdAt
    || (a.tcNodeId < b.tcNodeId ? -1 : 1));
  for (const e of ordered) {
    if (!humanAuthored(e)) continue;
    const c = e.content.toLowerCase();
    if (!c.includes(from.title.toLowerCase())) continue;
    const sentenceHit = e.content.split(/(?<=[.!?])/).some((s) => {
      const trimmed = s.trim();
      if (trimmed.endsWith('?')) return false;
      const m = confirmTerms.exec(trimmed);
      if (m === null) return false;
      return !NEGATION_BEFORE.test(trimmed.slice(0, m.index));
    });
    if (!sentenceHit) continue;
    for (const cand of candidates) {
      if (c.includes(cand.title.toLowerCase())) {
        return { to: cand, ruling: e.tcNodeId, date: isoOf(e.createdAt) };
      }
    }
  }
  return null;
}

/** @param {number} unixSeconds @returns {string} */
function isoOf(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = { reviewState, classifyChange, rulingCandidates, healingRuling, isoOf };
