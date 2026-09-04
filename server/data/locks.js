/**
 * Redis lock mechanics shared by every repo. Takes a key STRING so nothing here
 * knows what is locked; `keys.js` owns the shapes, each repo wraps `withLock`
 * in a named helper (`roomRepo.withActionLock`, `dailyRepo.withAttemptLock`).
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { LOCK_TTL_SECONDS, ACTION_LOCK_TTL_SECONDS } = require('./keys');

/** SET NX EX: truthy only for the winner. The TTL stops a crash wedging the key. */
const acquireLock = async (key, owner, ttlSeconds = LOCK_TTL_SECONDS) => {
    const client = await redisClient;
    return await client.set(key, owner, { NX: true, EX: ttlSeconds });
};

const releaseLock = async (key) => {
    const client = await redisClient;
    return await client.del(key);
};

/**
 * Deletes the lock only if this owner still holds it. A holder that overruns
 * its lease would otherwise DEL the next holder's lock. Lua so the check and
 * delete are one round trip.
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
 * Unique per acquisition, so two attempts from the same socket (the normal
 * case for a per-player PVP/daily lock) are distinguishable. Keeps `owner` in
 * it so a stuck lock still says who holds it.
 */
let acquisitions = 0;
const lockToken = (owner) => `${owner}#${process.pid}.${++acquisitions}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backoff for a contended action lock: quick first, then out of Redis's way. */
const ACTION_LOCK_FIRST_RETRY_MS = 5;
const ACTION_LOCK_MAX_RETRY_MS = 50;

/** Longer than the lease, so a holder that died mid-move only costs the next move its lease. */
const ACTION_LOCK_MAX_WAIT_MS = (ACTION_LOCK_TTL_SECONDS + 2) * 1000;

/**
 * Runs `fn` with an action lock held.
 *
 * A board is one hash field, so overlapping moves silently erase each other's
 * reveals. Callers must read INSIDE `fn`; anything read before is stale.
 * Contenders wait rather than drop, since the move has to land.
 *
 * If the wait is exhausted the action is REFUSED, never run unlocked. The wait
 * is exhausted by contention (a starved backoff spin), and running unlocked is
 * exactly the racing write this guards against: 203 concurrent daily opens
 * once lost 62 cells with no error. A refused move can simply be retried.
 *
 * Throws rather than returning a sentinel: every caller's try/catch already
 * degrades correctly, whereas a sentinel reads as a real result (`withJoinLock`
 * would report the room full).
 *
 * NOT reentrant. Holding two different locks is fine (`pvpRematch` does) but
 * they must be taken in a consistent order.
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
        throw new Error(`Lock ${key} never came free; action refused rather than run unlocked`);
    }

    try {
        return await fn();
    } finally {
        // Ownership-checked: `fn` can outlive the lease.
        await releaseLockIfOwned(key, token);
    }
};

module.exports = { acquireLock, releaseLock, releaseLockIfOwned, withLock };
