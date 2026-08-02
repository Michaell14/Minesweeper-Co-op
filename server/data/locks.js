/**
 * Redis lock mechanics, shared by every repository that needs one.
 *
 * These take a key STRING rather than a room or a date, so nothing here has to
 * know what is being locked. `keys.js` owns the key shapes; each repo wraps
 * `withLock` in a named helper its callers can read (`roomRepo.withActionLock`,
 * `dailyRepo.withAttemptLock`).
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

/**
 * Deletes the lock only if this owner still holds it.
 *
 * A plain DEL is a bug waiting for a slow moment: leases are short, so a holder
 * that overruns one has already had the key expire and handed the lock to
 * somebody else — and its release then deletes THEIR lock, putting two moves
 * back inside the section the lock exists to keep them out of.
 *
 * Lua because the check and the delete have to be one round trip; done as a GET
 * then a DEL, the same expiry can land between them.
 */
const RELEASE_IF_OWNED = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end`;

const releaseLockIfOwned = async (key, owner) => {
    const client = await redisClient;
    return await client.eval(RELEASE_IF_OWNED, { keys: [key], arguments: [String(owner)] });
};

/**
 * A value unique to ONE acquisition, so the ownership check can tell two
 * attempts apart even when they come from the same socket — which is the
 * ordinary case for a PVP or daily lock, where the key is per player and the
 * only contention IS that player's own two moves. The caller's `owner` stays in
 * it so a stuck lock still says who is holding it.
 */
let acquisitions = 0;
const lockToken = (owner) => `${owner}#${process.pid}.${++acquisitions}`;

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
 * the clients. Callers must do their reads INSIDE `fn`: anything read before the
 * lock was held is exactly the stale snapshot the lock exists to guard against.
 *
 * A contender waits rather than being dropped — the player made that move and it
 * has to land. If the wait is exhausted, Redis itself is unhealthy; `fn` then
 * runs unlocked, which is better than discarding the move.
 *
 * NOT reentrant. `fn` must not call anything that takes the same key. Holding
 * two different action locks at once is fine and `pvpRematch` does it, but they
 * have to be taken in a consistent order.
 */
const withLock = async (key, owner, fn) => {
    const deadline = Date.now() + ACTION_LOCK_MAX_WAIT_MS;
    const token = lockToken(owner);
    let retryMs = ACTION_LOCK_FIRST_RETRY_MS;
    let held = false;

    do {
        held = Boolean(await acquireLock(key, token, ACTION_LOCK_TTL_SECONDS));
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
        // Ownership-checked: `fn` can outlive the lease, and a bare DEL would
        // then delete whichever move acquired the key next.
        if (held) await releaseLockIfOwned(key, token);
    }
};

module.exports = { acquireLock, releaseLock, releaseLockIfOwned, withLock };
