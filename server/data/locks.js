/**
 * Redis lock mechanics, shared by every repository that needs one.
 *
 * These take a key STRING rather than a room or a date, so nothing here has to
 * know what is being locked. `keys.js` owns the key shapes; each repo wraps
 * `withLock` in a named helper its callers can read (`roomRepo.withActionLock`,
 * `dailyRepo.withAttemptLock`).
 *
 * This module was carved out of roomRepo when the daily challenge needed the
 * same lock: a daily attempt is not a room, and reaching into roomRepo for it
 * would have been the wrong dependency.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { LOCK_TTL_SECONDS, ACTION_LOCK_TTL_SECONDS } = require('./keys');

/**
 * SET NX EX: returns truthy only for the caller that won the race. Every lock
 * carries a short TTL so a crash mid-hold cannot wedge the resource permanently.
 */
const acquireLock = async (key, owner, ttlSeconds = LOCK_TTL_SECONDS) => {
    const client = await redisClient;
    return await client.set(key, owner, { NX: true, EX: ttlSeconds });
};

const releaseLock = async (key) => {
    const client = await redisClient;
    return await client.del(key);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backoff for a contended action lock: quick first, then out of Redis's way. */
const ACTION_LOCK_FIRST_RETRY_MS = 5;
const ACTION_LOCK_MAX_RETRY_MS = 50;

/**
 * Longer than the lease deliberately, so a holder that died mid-move costs the
 * next move its lease rather than wedging the resource: once the lease expires
 * the key is gone and the next acquire succeeds.
 */
const ACTION_LOCK_MAX_WAIT_MS = (ACTION_LOCK_TTL_SECONDS + 2) * 1000;

/**
 * Runs `fn` with an action lock held.
 *
 * A board lives in ONE hash field, so every move rewrites all of it. Two moves
 * that overlap both read before either writes, and the second write erases the
 * first's reveals — with no error, and with both sets of updates already sent to
 * the clients. This is what makes a move's read-modify-write atomic; callers
 * must do their reads INSIDE `fn`, since anything read before the lock was held
 * is exactly the stale snapshot the lock exists to prevent acting on.
 *
 * A contender waits rather than being dropped: the player made that move and it
 * has to land. If the wait is exhausted, Redis itself is unhealthy — `fn` then
 * runs unlocked, which is what happened before this lock existed and is better
 * than discarding the move.
 *
 * NOT reentrant. `fn` must not call anything that takes the same key. Holding
 * two different action locks at once is fine and `pvpRematch` does it, but they
 * have to be taken in a consistent order.
 */
const withLock = async (key, owner, fn) => {
    const deadline = Date.now() + ACTION_LOCK_MAX_WAIT_MS;
    let retryMs = ACTION_LOCK_FIRST_RETRY_MS;
    let held = false;

    do {
        held = Boolean(await acquireLock(key, owner, ACTION_LOCK_TTL_SECONDS));
        if (held) break;
        await sleep(retryMs);
        retryMs = Math.min(retryMs * 2, ACTION_LOCK_MAX_RETRY_MS);
    } while (Date.now() < deadline);

    if (!held) {
        console.error(`Lock ${key} never came free; running unlocked`);
    }

    try {
        return await fn();
    } finally {
        if (held) await releaseLock(key);
    }
};

module.exports = { acquireLock, releaseLock, withLock };
