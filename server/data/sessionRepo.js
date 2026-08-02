/**
 * Browser sessions.
 *
 * Player records are keyed by socket id, so a reload gives you a new socket and
 * therefore a new player. A session is the stable identity the client keeps in
 * sessionStorage; this maps it onto whichever socket holds it now, so a
 * returning player is swapped back into their room rather than added as a
 * stranger.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { sessionKey, ROOM_TTL_SECONDS } = require('./keys');

/** Everything known about a session: room, name, socketId. Empty if unknown. */
const getState = async (sessionId) => {
    const client = await redisClient;
    return await client.hGetAll(sessionKey(sessionId));
};

/**
 * Forgets which room this session was in, keeping the session itself. Called
 * only on a deliberate leave — a disconnect must NOT do this, since the room it
 * remembers is what lets a reload put them back, and both otherwise arrive at
 * the same `removePlayer` indistinguishable.
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
