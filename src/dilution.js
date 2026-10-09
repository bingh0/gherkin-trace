'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { compareCodePoints, jkey } = require('./util');

// Spec dilution — green-preserving strength loss on reviewed scenarios,
// watched from the review ruling (or sanctioning entry, R20/R24) onward.
// Everything here is derived from history at refresh time: git commits,
// the committed run manifest's own history, and the fence file's
// Sanctioned-changes section. No state is kept between refreshes — item
// lifetimes are pinned to observable anchors (R11: a confirmation lives
// while its spending green is the scenario's latest verdict; R16: an
// unconsumed notice stands while the entry stands; R18: a deletion
// confirmation retires at the corpus's next recorded run).
//
// Sanction lifecycle (R4/R16/R19/R23): an entry lies dormant until an
// edit touches its scenario — dormant entries survive greens, so a
// scoping-time entry outlives the gap to build. An edit is judged
// against the UNION of live entries: covered by any → the covering entry
// (whole entry, compound included) is spent at the scenario's first
// green after the edit; covered by none while entries are live → a
// sanction violation (breach class), and NO entry expires (R23 — an
// unrelated edit must not annihilate pending ratifications). Direction
// vocabulary: drops / rewords / adds / deletes-scenario; a deletion is
// spent at the thread end itself (R18). A directionless entry is
// malformed and loud; the edit fires as if unsanctioned (R10).

/**
 * @typedef {{
 *   file: string, title: string,
 *   directions: string[],
 *   malformed: boolean,
 *   line: number,
 *   entryDate: string | null,
 *   removed: boolean,
 * }} SanctionEntry
 */

const DIRECTIONS = ['drops', 'rewords', 'adds', 'deletes-scenario'];

/**
 * Parse the fence file's `## Sanctioned changes` section. Entry shape
 * (scope C6 with direction, v3.1 amendment): a bullet opening with the
 * bold feature-file path, the scenario title in quotes, and one or more
 * direction words after a "direction:"/"directions:" marker. The entry
 * date is the first ISO date in the trailing parenthetical, matching the
 * fence transcription convention.
 * @param {string} text @returns {SanctionEntry[]}
 */
function parseSanctions(text) {
  /** @type {SanctionEntry[]} */
  const entries = [];
  let section = '';
  /** @type {{raw: string, line: number} | null} */
  let current = null;
  const flush = () => {
    if (current === null) return;
    const raw = current.raw.replace(/\s+/g, ' ');
    const file = /\*\*(.+?)\*\*/.exec(raw)?.[1]?.trim();
    const title = /"([^"]+)"/.exec(raw)?.[1];
    if (file === undefined || title === undefined) {
      current = null;
      return;
    }
    // Directions come ONLY from an explicit `direction:`/`directions:`
    // marker — a direction word loose in the entry's prose must not
    // silently validate a legacy directionless entry (R10 is loud).
    const dirText = /directions?:(.*)$/i.exec(raw)?.[1];
    const directions = dirText === undefined ? []
      : DIRECTIONS.filter((d) =>
        new RegExp(`\\b${d.replace('-', '[-\\s]')}\\b`, 'i').test(dirText));
    const paren = /\(([^)]*)\)\s*$/.exec(raw.trim());
    const dates = (paren === null ? [] : (paren[1].match(/\d{4}-\d{2}-\d{2}/g) ?? [])).slice().sort();
    entries.push({
      file,
      title,
      directions,
      malformed: directions.length === 0,
      line: current.line,
      entryDate: dates[0] ?? null,
      removed: false,
    });
    current = null;
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const heading = /^#+\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      section = heading[1].trim().toLowerCase();
      continue;
    }
    if (!/^sanctioned changes\b/.test(section)) continue;
    if (line.startsWith('- ')) {
      flush();
      current = { raw: line, line: i + 1 };
    } else if (current !== null && /^\s+\S/.test(line)) {
      current.raw += ` ${line.trim()}`;
    } else if (current !== null && line.trim() === '') {
      flush();
    }
  }
  flush();
  return entries;
}

/**
 * @param {string} root @param {string[]} args
 * @returns {string | null}
 */
function git(root, args) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * @param {string} iso @returns {string} ISO instant in UTC, seconds resolution.
 * Must stay format-identical to history.js toUtc: run dates (this file) and
 * edit dates (history.js) are compared as strings across the engine, and a
 * millisecond suffix on one side makes same-second comparisons resolve by
 * format ('.000Z' sorts before 'Z') instead of by instant.
 */
function toUtc(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Union of the current Sanctioned-changes entries with every entry that
 * ever appeared in the fence file's git history — removed entries stay
 * queryable in the timeline (R4: the window derives from fence git
 * history; entry deletion is the retirement act, and the timeline
 * records the entry and its removal).
 * @param {string} root @param {string} fenceRel
 * @param {string | null} currentText
 * @returns {SanctionEntry[]}
 */
function collectSanctions(root, fenceRel, currentText) {
  const current = currentText === null ? [] : parseSanctions(currentText);
  const seen = new Set(current.map((e) => jkey(e.file, e.title) + `@${e.entryDate}`));
  const log = git(root, ['log', '--first-parent', '--reverse', '--format=%H', '--', fenceRel]);
  if (log !== null) {
    for (const hash of log.trim().split('\n').filter((h) => h !== '')) {
      const blob = git(root, ['show', `${hash}:${fenceRel}`]);
      if (blob === null) continue;
      for (const e of parseSanctions(blob)) {
        const k = jkey(e.file, e.title) + `@${e.entryDate}`;
        if (seen.has(k)) continue;
        seen.add(k);
        entriesPush(current, { ...e, removed: true });
      }
    }
  }
  return current;
}

/**
 * @param {SanctionEntry[]} arr @param {SanctionEntry} e
 */
function entriesPush(arr, e) {
  arr.push(e);
  arr.sort((a, b) => compareCodePoints(a.entryDate ?? '', b.entryDate ?? '')
    || compareCodePoints(a.title, b.title));
}

/**
 * Mine the committed run manifest's git history into per-scenario verdict
 * series plus the ordered list of recorded runs. Both manifest formats
 * are read (bare 0.8.0 rows; 0.9.0 line-1 declaration skipped — history
 * mining is best-effort and never fails the refresh).
 * @param {string} root
 * @param {string | null} manifestRel root-relative POSIX path, or null when no manifest
 * @returns {{
 *   available: boolean,
 *   runs: Array<{commit: string, date: string}>,
 *   series: Map<string, Array<{date: string, status: string}>>,
 * }}
 */
function collectVerdicts(root, manifestRel) {
  /** @type {Map<string, Array<{date: string, status: string}>>} */
  const series = new Map();
  /** @type {Array<{commit: string, date: string}>} */
  const runs = [];
  if (manifestRel === null) return { available: false, runs, series };
  const log = git(root, ['log', '--first-parent', '--reverse', '--format=%H %cI', '--', manifestRel]);
  if (log === null || log.trim() === '') return { available: false, runs, series };
  for (const line of log.trim().split('\n')) {
    const sp = line.indexOf(' ');
    const commit = line.slice(0, sp);
    const date = toUtc(line.slice(sp + 1));
    const blob = git(root, ['show', `${commit}:${manifestRel}`]);
    if (blob === null) continue;
    runs.push({ commit, date });
    const manifestDir = path.posix.dirname(manifestRel);
    // The path contract is per-account (0.9.0 compat ruling): a DECLARED
    // account's rows resolve against the manifest's own location; a bare
    // account's rows join verbatim — an off-root bare manifest must not
    // have its rows re-rooted.
    const firstLine = blob.split('\n').find((l) => l.trim() !== '');
    let declared = false;
    try {
      declared = firstLine !== undefined
        && typeof JSON.parse(firstLine)['run-manifest'] === 'number';
    } catch {
      declared = false;
    }
    for (const raw of blob.split('\n')) {
      if (raw.trim() === '') continue;
      /** @type {Record<string, unknown>} */
      let row;
      try {
        row = JSON.parse(raw);
      } catch {
        continue;
      }
      if (typeof row['run-manifest'] === 'number') continue; // the declaration
      if (typeof row.file !== 'string' || typeof row.title !== 'string'
        || typeof row.status !== 'string') continue;
      const file = declared && manifestDir !== '.'
        ? path.posix.normalize(path.posix.join(manifestDir, row.file))
        : row.file;
      const k = jkey(file, row.title);
      const arr = series.get(k) ?? [];
      arr.push({ date, status: row.status });
      series.set(k, arr);
    }
  }
  return { available: runs.length > 0, runs, series };
}

/**
 * Classify one committed edit's direction from the mass series around it.
 * @param {{thens: number, rows: number | null} | undefined} before
 * @param {{thens: number, rows: number | null} | undefined} after
 * @returns {'drops' | 'adds' | 'rewords'}
 */
function editDirection(before, after) {
  if (before === undefined || after === undefined) return 'rewords';
  const b = before.rows ?? before.thens;
  const a = after.rows ?? after.thens;
  if (a < b) return 'drops';
  if (a > b) return 'adds';
  return 'rewords';
}

/**
 * The dilution engine: walk each watched scenario's history and derive
 * sightings, sanction consumption, violations, notices, and the timeline.
 *
 * @param {{
 *   corpus: Array<{key: string, file: string, title: string}>,
 *   timelines: Map<string, import('./history').Timeline>,
 *   massSeries: Map<string, Array<{commit: string, date: string, thens: number, rows: number | null}>>,
 *   closed: import('./history').ClosedThread[],
 *   verdicts: ReturnType<typeof collectVerdicts>,
 *   sanctions: SanctionEntry[],
 *   reviewedKeys: Set<string>,
 *   truncatedBefore: string | null,
 * }} input
 * @returns {{
 *   signals: Map<string, Array<{signal: string, evidence: Record<string, unknown>}>>,
 *   sanctionedDeletions: Map<string, {entryDate: string | null, retired: boolean}>,
 *   provenance: Map<string, {entryDate: string | null, line: number}>,
 *   covered: Map<string, string[]>,
 *   timelinesOut: Map<string, Array<Record<string, unknown>>>,
 *   notes: string[],
 * }}
 */
function computeDilution({ corpus, timelines, massSeries, closed, verdicts, sanctions,
  reviewedKeys, truncatedBefore }) {
  /** @type {Map<string, Array<{signal: string, evidence: Record<string, unknown>}>>} */
  const signals = new Map();
  /** @type {Map<string, {entryDate: string | null, retired: boolean}>} */
  const sanctionedDeletions = new Map();
  /** @type {Map<string, {entryDate: string | null, line: number}>} */
  const provenance = new Map();
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const timelinesOut = new Map();
  /** @type {Map<string, string[]>} covered edit dates per scenario — the
   * absorbed reviewed-then-changed flag stands down for a covered edit;
   * the confirmation is its voice (R3). */
  const covered = new Map();
  /** @type {string[]} */
  const notes = [];

  /** @type {Map<string, SanctionEntry[]>} */
  const sanctionsByKey = new Map();
  for (const e of sanctions) {
    const k = jkey(e.file, e.title);
    const arr = sanctionsByKey.get(k) ?? [];
    arr.push(e);
    sanctionsByKey.set(k, arr);
    if (e.malformed && !e.removed) {
      notes.push(`the sanctioned-changes entry for "${e.title}" names no direction — `
        + 'the entry is malformed and covers nothing; the edit fires as unsanctioned '
        + `(fence line ${e.line}).`);
    }
  }
  // R20/R24: a sanction entry is itself review provenance — the entry
  // transcribes a dated ruling naming the scenario.
  for (const c of corpus) {
    if (reviewedKeys.has(c.key)) continue;
    const entry = (sanctionsByKey.get(c.key) ?? []).find((e) => !e.removed);
    if (entry !== undefined) {
      provenance.set(c.key, { entryDate: entry.entryDate, line: entry.line });
    }
  }

  const lastRun = verdicts.runs.length > 0 ? verdicts.runs[verdicts.runs.length - 1] : null;

  for (const c of corpus) {
    const watched = reviewedKeys.has(c.key) || provenance.has(c.key);
    const tl = timelines.get(c.key);
    const mass = massSeries.get(c.key) ?? [];
    const runSeries = verdicts.series.get(c.key) ?? [];
    /** @type {Array<Record<string, unknown>>} */
    const timeline = [];
    for (const m of mass) {
      timeline.push({ at: m.date, event: 'mass', thens: m.thens, rows: m.rows, commit: m.commit });
    }
    for (const e of tl?.events ?? []) {
      timeline.push({ at: e.date, event: e.event, commit: e.commit });
    }
    for (const v of runSeries) {
      timeline.push({ at: v.date, event: 'verdict', status: v.status });
    }
    for (const s of sanctionsByKey.get(c.key) ?? []) {
      timeline.push({
        at: s.entryDate ?? '', event: 'sanction-entry', directions: s.directions,
        malformed: s.malformed, removed: s.removed, line: s.line,
      });
    }
    timeline.sort((a, b) => compareCodePoints(String(a.at), String(b.at)));
    timelinesOut.set(c.key, timeline);
    // Outline entries carry a mass series but no timeline of their own —
    // their rows are the mass (R14); everything else needs the thread.
    if (!watched || (tl === undefined && mass.length === 0)) continue;

    /** @type {Array<{signal: string, evidence: Record<string, unknown>}>} */
    const mine = [];

    // --- committed edits, in order, against the union of live entries ----
    const live = (sanctionsByKey.get(c.key) ?? [])
      .filter((e) => !e.removed && !e.malformed)
      .map((e) => ({ entry: e, spentAt: /** @type {string | null} */ (null), touched: false }));
    const edits = (tl?.events ?? [])
      .filter((e) => e.event === 'changed' && e.date !== '')
      .sort((a, b) => compareCodePoints(a.date, b.date));
    /** @type {Array<{date: string, commit: string, direction: string, coveredBy: SanctionEntry | null, violation: boolean}>} */
    const judged = [];
    for (const edit of edits) {
      const idx = mass.findIndex((m) => m.commit === edit.commit);
      const dir = editDirection(idx > 0 ? mass[idx - 1] : undefined,
        idx >= 0 ? mass[idx] : undefined);
      const inWindow = live.filter((l) => l.spentAt === null
        && l.entry.entryDate !== null && edit.date > `${l.entry.entryDate}T00:00:00Z`);
      /** @type {SanctionEntry | null} */
      let coveredBy = null;
      let violation = false;
      if (inWindow.length > 0) {
        const covering = inWindow.find((l) => l.entry.directions.includes(dir));
        if (covering !== undefined) {
          covering.touched = true;
          // whole-entry spend at the scenario's first green after the edit
          const green = runSeries.find((v) => v.date > edit.date && v.status === 'passed');
          if (green !== undefined) covering.spentAt = green.date;
          coveredBy = covering.entry;
        } else {
          violation = true;
        }
      }
      judged.push({ date: edit.date, commit: edit.commit, direction: dir, coveredBy, violation });
      if (coveredBy !== null) {
        const arr = covered.get(c.key) ?? [];
        arr.push(edit.date);
        covered.set(c.key, arr);
      }
    }

    for (const j of judged) {
      if (!j.violation) continue;
      mine.push({
        signal: 'sanction violation',
        evidence: {
          commit: j.commit, at: j.date, direction: j.direction,
          statement: 'an edit outside every live sanction\'s direction defied the written ruling',
          sanctions: live.map((l) => ({ directions: l.entry.directions, entryDate: l.entry.entryDate })),
        },
      });
    }

    // --- consumption confirmations (R3/R11) ------------------------------
    for (const l of live) {
      if (l.spentAt === null) continue;
      const latest = runSeries.length > 0 ? runSeries[runSeries.length - 1] : null;
      if (latest !== null && latest.date === l.spentAt) {
        mine.push({
          signal: 'sanction confirmation',
          evidence: {
            statement: 'sanctioned change landed as ruled',
            entryDate: l.entry.entryDate, directions: l.entry.directions,
            spentAt: l.spentAt, line: l.entry.line,
            commit: judged.find((j) => j.coveredBy === l.entry)?.commit ?? null,
          },
        });
      }
      timelinesOut.get(c.key)?.push({ at: l.spentAt, event: 'sanction-spent', line: l.entry.line });
    }

    // --- unconsumed standing notice (R12/R16/R17) ------------------------
    for (const l of live) {
      if (l.spentAt !== null || l.touched || l.entry.entryDate === null) continue;
      const greenAfter = runSeries.some((v) => v.status === 'passed'
        && v.date > `${l.entry.entryDate}T00:00:00Z`);
      if (greenAfter) {
        mine.push({
          signal: 'unconsumed sanction',
          evidence: {
            statement: 'a ratified change never landed — the sanction stands unconsumed',
            entryDate: l.entry.entryDate, directions: l.entry.directions, line: l.entry.line,
          },
        });
      }
    }

    // --- the red span (R8): unsanctioned edits coupled to a verdict flip -
    for (let i = 1; i < runSeries.length; i++) {
      if (runSeries[i].status !== 'passed' || runSeries[i - 1].status === 'passed') continue;
      // span start: the last green before the red run(s), or history start
      let start = 0;
      for (let k = i - 1; k >= 0; k--) {
        if (runSeries[k].status === 'passed') {
          start = k + 1;
          break;
        }
      }
      const spanStart = start === 0 ? null : runSeries[start - 1].date;
      // <=: the boundary commit of a truncated history compresses all
      // prior history into itself — a span anchored AT the boundary is as
      // unestablishable as one crossing it.
      if (truncatedBefore !== null && (spanStart === null || spanStart <= truncatedBefore)) {
        notes.push(`a failing span for "${c.title}" may cross the truncated history boundary — `
          + 'the span\'s order could not be established; no dilution sighting is derived from it.');
        continue;
      }
      const coupled = judged.filter((j) => !j.violation && j.coveredBy === null
        && (spanStart === null || j.date > spanStart) && j.date < runSeries[i].date);
      for (const j of coupled) {
        mine.push({
          signal: 'verdict-coupled edit',
          evidence: {
            commit: j.commit, at: j.date, direction: j.direction,
            flippedGreenAt: runSeries[i].date,
            statement: 'a reviewed-text change during a failing span couples to the flip to green',
          },
        });
      }
    }

    // --- assertion-mass decline (R14/R22): falling series under green ----
    // The judged window opens after the last drop an entry covered or a
    // violation already reported: a spent sanction ratifies ITS drop only —
    // it must not launder every later unsanctioned shed (whole-entry spend
    // is per entry, R4/R19, never a standing license).
    const lastJudgedDrop = judged
      .filter((j) => j.direction === 'drops' && (j.coveredBy !== null || j.violation))
      .map((j) => j.date)
      .sort(compareCodePoints)
      .pop();
    const declineMass = lastJudgedDrop === undefined ? mass
      : mass.filter((m) => m.date >= lastJudgedDrop);
    if (declineMass.length >= 2) {
      const isOutline = declineMass.some((m) => m.rows !== null);
      const values = declineMass.map((m) => (isOutline ? (m.rows ?? 0) : m.thens));
      const peak = Math.max(...values.slice(0, -1));
      const nowV = values[values.length - 1];
      const latest = runSeries.length > 0 ? runSeries[runSeries.length - 1] : null;
      if (nowV < peak && latest !== null && latest.status === 'passed') {
        const sheddingCommits = declineMass.filter((m, i) => i > 0
          && (isOutline ? (m.rows ?? 0) < (declineMass[i - 1].rows ?? 0)
            : m.thens < declineMass[i - 1].thens))
          .map((m) => ({ commit: m.commit, at: m.date }));
        mine.push({
          signal: 'assertion decline',
          evidence: {
            series: values.filter((v, i) => i === 0 || v !== values[i - 1]),
            kind: isOutline ? 'examples rows' : 'assertions',
            sheddingCommits,
            statement: 'assertion mass fell while the scenario stayed green',
          },
        });
      }
    }

    if (tl !== undefined && tl.uncommittedChange) {
      notes.push(`"${c.title}" carries an uncommitted change — its order against the `
        + 'dilution window could not be established.');
    }
    if (mine.length > 0) signals.set(c.key, mine);
  }

  // --- sanctioned deletions (R18): thread end spends the entry ----------
  for (const t of closed) {
    if (t.reason !== 'deleted') continue;
    const k = jkey(t.file, t.title);
    const entry = (sanctionsByKey.get(k) ?? []).find((e) => !e.malformed
      && e.directions.includes('deletes-scenario')
      && e.entryDate !== null && t.closedAt.date > `${e.entryDate}T00:00:00Z`);
    if (entry === undefined) continue;
    // Retires at the corpus's next recorded run after the deletion.
    const retired = lastRun !== null && lastRun.date > t.closedAt.date;
    sanctionedDeletions.set(k, { entryDate: entry.entryDate, retired });
    const timeline = timelinesOut.get(k) ?? [];
    timeline.push({ at: t.closedAt.date, event: 'sanction-spent-by-deletion', line: entry.line });
    timelinesOut.set(k, timeline);
  }

  return { signals, sanctionedDeletions, provenance, covered, timelinesOut, notes };
}

/**
 * A shallow clone truncates history: the earliest readable commit is a
 * boundary, not a beginning. Returns the boundary date, or null for full
 * history (or no git at all — the caller names that separately).
 * @param {string} root @returns {string | null}
 */
function truncationBoundary(root) {
  if (!fs.existsSync(path.join(root, '.git', 'shallow'))) return null;
  const log = git(root, ['log', '--reverse', '--format=%cI']);
  if (log === null || log.trim() === '') return null;
  return toUtc(log.trim().split('\n')[0]);
}

module.exports = { parseSanctions, collectSanctions, collectVerdicts, computeDilution,
  truncationBoundary };
