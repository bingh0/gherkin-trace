'use strict';

/**
 * A refusal is contract behavior, not a crash: the tool declines and the
 * message teaches — where the request belongs, or what restores answers.
 */
class GtRefusal extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'GtRefusal';
  }
}

/**
 * A refresh that failed partway. The picture is marked broken on disk;
 * queries refuse until a successful refresh restores answers.
 */
class GtRefreshFailure extends Error {
  /** @param {string} message @param {unknown} [cause] */
  constructor(message, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'GtRefreshFailure';
  }
}

module.exports = { GtRefusal, GtRefreshFailure };
