/**
 * Browser sessions.
 *
 * Player records are keyed by socket id, so they do not survive a reconnect —
 * a reload gives you a new socket and therefore a new player. A session is the
 * stable identity the client keeps in localStorage; this maps it onto whichever
 * socket currently holds it, so a returning player can be swapped back into
 * their room rather than added as a stranger.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { sessionKey, ROOM_TTL_SECONDS } = require('./keys');

/** The whole session hash: { room, name, socketId }. Empty for an unknown id. */
const getState = async (sessionId) => {
    const client = await redisClient;
    return await client.hGetAll(sessionKey(sessionId));
};

/** The socket this session was last seen on, or null. */
const getSocketId = async (sessionId) => {
    const client = await redisClient;
    return await client.hGet(sessionKey(sessionId), 'socketId');
};

/** Binds a session to a socket and refreshes its lifetime. */
const save = async (sessionId, { room, name, socketId }) => {
    const client = await redisClient;
    await client.hSet(sessionKey(sessionId), { room, name, socketId });
    await client.expire(sessionKey(sessionId), ROOM_TTL_SECONDS);
};

module.exports = { getState, getSocketId, save };
