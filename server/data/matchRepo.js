/**
 * The quick-match queue. Storage only: WHO is eligible to be paired is policy
 * in controllers/matchmakingController.js, the only thing that knows what a
 * live socket is. One hash keyed by socket id (see data/keys.js), so a double
 * click overwrites a player's own entry rather than queueing them twice.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { withLock } = require('./locks');
const { matchQueueKey, matchLockKey, MATCH_QUEUE_TTL_SECONDS } = require('./keys');

/**
 * Adds or refreshes this socket's place. The TTL is refreshed on every
 * enqueue, so a live queue never expires under a waiting player.
 */
const enqueue = async (socketId, { name, sessionId, queuedAt }) => {
    const client = await redisClient;
    await client.hSet(matchQueueKey(), {
        [socketId]: JSON.stringify({ name, sessionId: sessionId || '', queuedAt }),
    });
    await client.expire(matchQueueKey(), MATCH_QUEUE_TTL_SECONDS);
};

/**
 * Everyone waiting, oldest first. An unparseable entry comes back with
 * `queuedAt: 0` so the caller's too-old prune takes it out.
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

/** Serialises "is anyone waiting, and if so take them". Its own key: there is no room to lock yet. */
const withMatchLock = (owner, fn) => withLock(matchLockKey(), owner, fn);

module.exports = { enqueue, listWaiting, remove, withMatchLock };
