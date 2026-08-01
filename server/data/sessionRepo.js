/**
 * Browser sessions.
 *
 * Player records are keyed by socket id, so they do not survive a reconnect —
 * a reload gives you a new socket and therefore a new player. A session is the
 * stable identity the client keeps in sessionStorage; this maps it onto whichever
 * socket currently holds it, so a returning player can be swapped back into
 * their room rather than added as a stranger.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { sessionKey, ROOM_TTL_SECONDS } = require('./keys');

/** Everything known about a session: room, name, socketId. Empty if unknown. */
const getState = async (sessionId) => {
    const client = await redisClient;
    return await client.hGetAll(sessionKey(sessionId));
};

/**
 * Forgets which room this session was in, keeping the session itself.
 *
 * Called only when a player leaves on purpose. A disconnect deliberately does
 * NOT do this: the room it remembers is what lets a reload put them back, and
 * the two arrive at the same `removePlayer` otherwise indistinguishable.
 */
const clearRoom = async (sessionId) => {
    const client = await redisClient;
    await client.hDel(sessionKey(sessionId), 'room');
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

module.exports = { getSocketId, getState, clearRoom, save };
