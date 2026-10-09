'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Lifecycle on disk, in .gherkin-trace/:
//   picture.db    — the projection (one refresh's truth, atomically swapped)
//   refresh.json  — summary of the last SUCCESSFUL refresh (holds the refresh
//                   time and generation, so picture bytes stay source-determined)
//   broken.json   — present iff the last refresh failed; queries refuse
//   refresh.lock  — present while a refresh runs ({pid, startedAt})
//
// Honesty rules encoded here:
// - broken.json outranks everything, including a live restoring refresh:
//   answers stay refused until a refresh SUCCEEDS, not merely starts.
// - A lock whose pid is dead is a crashed refresh: broken, never
//   stale-served-as-current. (A kill landing between writeRefreshOk and the
//   lock removal misreads a success as a crash — a false refusal, the
//   conservative direction, and one syscall wide.)
// - Lock acquisition is linkSync — the lock file's content is complete the
//   instant it becomes visible, so a reader can never observe a half-written
//   lock. A dead lock is stolen via renameSync, which only one claimant can
//   win; losers loop and re-examine.

const PICTURE = 'picture.db';
const REFRESH = 'refresh.json';
const BROKEN = 'broken.json';
const LOCK = 'refresh.lock';

/**
 * @typedef {{
 *   phase: 'never' | 'ok' | 'broken' | 'refreshing',
 *   refresh?: Record<string, unknown>,
 *   broken?: { error: string, startedAt: string },
 *   lock?: { pid: number, startedAt: string },
 * }} PictureState
 */

/** @param {string} pictureDir @returns {PictureState} */
function readState(pictureDir) {
  const broken = readJson(path.join(pictureDir, BROKEN));
  if (broken) {
    return { phase: 'broken', broken: { error: String(broken.error), startedAt: String(broken.startedAt) } };
  }
  const lock = readJson(path.join(pictureDir, LOCK));
  if (lock && typeof lock.pid === 'number') {
    const info = { pid: lock.pid, startedAt: String(lock.startedAt) };
    if (!pidAlive(lock.pid)) {
      return {
        phase: 'broken',
        broken: { error: `the refresh started at ${info.startedAt} crashed`, startedAt: info.startedAt },
      };
    }
    const refresh = readJson(path.join(pictureDir, REFRESH));
    return refresh && fs.existsSync(path.join(pictureDir, PICTURE))
      ? { phase: 'refreshing', lock: info, refresh }
      : { phase: 'refreshing', lock: info };
  }
  const refresh = readJson(path.join(pictureDir, REFRESH));
  if (refresh && fs.existsSync(path.join(pictureDir, PICTURE))) {
    return { phase: 'ok', refresh };
  }
  return { phase: 'never' };
}

/**
 * Acquire the refresh lock, or return the live holder. The content is
 * written to a private file and linkSync'd into place — creation is atomic
 * WITH content, so no observer ever reads an empty lock. A dead holder's
 * lock is stolen by renameSync (single winner); the loser loops.
 * @param {string} pictureDir @param {string} startedAt
 * @returns {{ acquired: true } | { acquired: false, holder: { pid: number, startedAt: string } }}
 */
function acquireLock(pictureDir, startedAt) {
  fs.mkdirSync(pictureDir, { recursive: true });
  // Owner-only: the dir carries the sidecar blob other tools read — its
  // permissions are part of the pane contract's producer obligations.
  fs.chmodSync(pictureDir, 0o700);
  const lockPath = path.join(pictureDir, LOCK);
  const mine = `${lockPath}.${process.pid}`;
  fs.writeFileSync(mine, JSON.stringify({ pid: process.pid, startedAt }));
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        fs.linkSync(mine, lockPath);
        return { acquired: true };
      } catch (e) {
        if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'EEXIST') throw e;
      }
      const holder = readJson(lockPath);
      if (holder && typeof holder.pid === 'number' && pidAlive(holder.pid)) {
        return { acquired: false, holder: { pid: holder.pid, startedAt: String(holder.startedAt) } };
      }
      // Dead (or unreadable, which the link protocol makes equivalent to
      // stale): steal atomically — exactly one claimant's rename succeeds.
      const grave = `${lockPath}.stale.${process.pid}.${attempt}`;
      try {
        fs.renameSync(lockPath, grave);
        fs.rmSync(grave, { force: true });
      } catch {
        // another claimant stole it first; loop and re-examine
      }
    }
    throw new Error('could not acquire the refresh lock after 100 attempts');
  } finally {
    fs.rmSync(mine, { force: true });
  }
}

/** @param {string} pictureDir */
function releaseLock(pictureDir) {
  fs.rmSync(path.join(pictureDir, LOCK), { force: true });
}

/**
 * Declare the refresh successful: clear the failure marker, then publish the
 * summary. Both writes are atomic (write-aside + rename); a crash between
 * them leaves the previous summary with a new-generation picture, which the
 * generation cross-check turns into a refusal rather than a mislabeled answer.
 * @param {string} pictureDir @param {Record<string, unknown>} summary
 */
function writeRefreshOk(pictureDir, summary) {
  fs.rmSync(path.join(pictureDir, BROKEN), { force: true });
  writeAtomic(path.join(pictureDir, REFRESH), JSON.stringify(summary, null, 2) + '\n');
}

/**
 * Mark the picture broken. If even this write fails (disk full is the
 * likeliest partway failure), fall back to deleting refresh.json — the
 * picture then refuses as never-built rather than serving stale answers as
 * current: always the conservative direction.
 * @param {string} pictureDir @param {string} error @param {string} startedAt
 */
function writeBroken(pictureDir, error, startedAt) {
  try {
    writeAtomic(path.join(pictureDir, BROKEN), JSON.stringify({ error, startedAt }, null, 2) + '\n');
  } catch {
    fs.rmSync(path.join(pictureDir, REFRESH), { force: true });
  }
}

/** @param {string} pictureDir @returns {string} */
function picturePath(pictureDir) {
  return path.join(pictureDir, PICTURE);
}

/** @param {string} p @param {string} content */
function writeAtomic(p, content) {
  const tmp = `${p}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}

/** @param {string} p @returns {Record<string, any> | null} */
function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** @param {number} pid @returns {boolean} */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return /** @type {NodeJS.ErrnoException} */ (e).code === 'EPERM';
  }
}

module.exports = { readState, acquireLock, releaseLock, writeRefreshOk, writeBroken, picturePath };
