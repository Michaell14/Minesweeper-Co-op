/**
 * Browser sessions. Player records are keyed by socket id, so a reload makes
 * a new player; the session is the stable identity the client keeps in
 * sessionStorage, mapped here onto whichever socket holds it now so a
 * returning player is swapped back into their room.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { sessionKey, ROOM_TTL_SECONDS } = require('./keys');

/** Everything known about a session: room, name, socketId. Empty if unknown. */
const getState = async (sessionId) => {
    const client = await redisClient;
    return await client.hGetAll(sessionKey(sessionId));
};

/**
 * Forgets which room this session was in. Called only on a deliberate leave;
 * a disconnect must NOT, since the remembered room is what a reload rejoins.
 */
const clearRoom = async (sessionId) => {
    const client = await redisClient;
    await client.hDel(sessionKey(sessionId), ['room', 'score', 'scoreRoom', 'scoreRun']);
};

/**
 * Keeps a disconnecting player's score for the reload that may follow: the
 * player record is deleted when the socket drops, and the session spans the
 * gap. The room is stored beside it so a score never crosses rooms, and `run`
 * (the room's `startedAt`) pins it to one game, or a player returning to a
 * board someone reset would start the new game already ahead.
 */
const stashScore = async (sessionId, { room, score, run }) => {
    const client = await redisClient;
    await client.hSet(sessionKey(sessionId), {
        score: score.toString(),
        scoreRoom: room,
        scoreRun: run,
    });
    await client.expire(sessionKey(sessionId), ROOM_TTL_SECONDS);
};

/**
 * The stashed score for this room's current run, consumed even when it does
 * not match: a score must be restored ONCE, or a later rejoin would undo what
 * the player scored in between. 0 when there is none.
 */
const takeScore = async (sessionId, room, run) => {
    const client = await redisClient;
    const state = await client.hGetAll(sessionKey(sessionId));
    /*
     * The DELETE decides who gets it, not the read: two tabs with the same
     * session id can resume at once (co-op takes no join lock), and hDel
     * reports how many fields each caller removed, so the loser leaves with 0.
     */
    const claimed = await client.hDel(sessionKey(sessionId), ['score', 'scoreRoom', 'scoreRun']);
    if (!claimed || state.scoreRoom !== room || state.scoreRun !== run) return 0;
    return parseInt(state.score || '0', 10) || 0;
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

module.exports = { getSocketId, getState, clearRoom, save, stashScore, takeScore };
