/**
 * The quick-match queue: who is waiting to be paired into a PVP room.
 *
 * Storage only. WHO is eligible to be paired — still connected, not already in
 * a room, not the searcher themselves — is policy, and lives in
 * controllers/matchmakingController.js, which is the only thing that knows what
 * a live socket is.
 *
 * The queue is one hash keyed by socket id (see data/keys.js for why one queue
 * and why that key), so a double click overwrites a player's own entry instead
 * of putting them in line twice.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { withLock } = require('./locks');
const { matchQueueKey, matchLockKey, MATCH_QUEUE_TTL_SECONDS } = require('./keys');

/**
 * Adds or refreshes this socket's place in the queue.
 *
 * The TTL is refreshed on every enqueue rather than set once, so an actively
 * used queue never expires under a waiting player.
 */
const enqueue = async (socketId, { name, sessionId, queuedAt }) => {
    const client = await redisClient;
    await client.hSet(matchQueueKey(), {
        [socketId]: JSON.stringify({ name, sessionId: sessionId || '', queuedAt }),
    });
    await client.expire(matchQueueKey(), MATCH_QUEUE_TTL_SECONDS);
};

/**
 * Everyone waiting, oldest first.
 *
 * An entry that will not parse comes back with `queuedAt: 0` rather than being
 * dropped: the caller rejects anything too old and prunes what it rejects, so
 * unreadable entries take that same exit instead of sitting in the hash until
 * its TTL.
 */
const listWaiting = async () => {
    const client = await redisClient;
    const queue = (await client.hGetAll(matchQueueKey())) || {};

    return Object.entries(queue)
        .map(([socketId, raw]) => {
            try {
                const { name, sessionId, queuedAt } = JSON.parse(raw);
                return { socketId, name, sessionId, queuedAt: Number(queuedAt) || 0 };
            } catch {
                return { socketId, name: '', sessionId: '', queuedAt: 0 };
            }
        })
        .sort((a, b) => a.queuedAt - b.queuedAt);
};

/** Drops a socket from the queue. A no-op for one that was never in it. */
const remove = async (socketId) => {
    const client = await redisClient;
    return await client.hDel(matchQueueKey(), socketId);
};

/**
 * Serialises "is anyone waiting, and if so take them". Its own key rather than
 * any room's: at this point in the flow there is no room to lock.
 */
const withMatchLock = (owner, fn) => withLock(matchLockKey(), owner, fn);

module.exports = { enqueue, listWaiting, remove, withMatchLock };
