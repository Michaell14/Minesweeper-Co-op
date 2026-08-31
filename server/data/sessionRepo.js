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
    await client.hDel(sessionKey(sessionId), ['room', 'score', 'scoreRoom', 'scoreRun']);
};

/**
 * Keeps a disconnecting player's score for the reload that may follow.
 *
 * The score lives on the player record, which is keyed by socket id and deleted
 * the moment the socket drops — so by the time the new socket rejoins there is
 * nothing left to read it from. The session is the identity that spans that
 * gap, so the number waits here.
 *
 * The room is stored beside it because a score only means anything in the room
 * it was earned in. Without that, leaving room A and later joining room B could
 * hand over a score from a different game.
 *
 * `run` is the room's `startedAt`, and pins it to the game as well as the room.
 * The same room hosts run after run: reset clears `startedAt` and the next one
 * stamps a fresh value, so a player who dropped out at 107 and returned to a
 * board someone else had reset would otherwise have come back to a new game
 * already 107 points ahead of it.
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
 * The stashed score for this room's current run, consumed. 0 when there is
 * none, or when the stash belongs to a different room or an earlier run.
 *
 * Consumed rather than read, and consumed even when it does not match: a score
 * must be restored ONCE. Left in place it would come back on a later rejoin and
 * undo whatever the player scored in between.
 */
const takeScore = async (sessionId, room, run) => {
    const client = await redisClient;
    const state = await client.hGetAll(sessionKey(sessionId));
    /*
     * The DELETE decides who gets it, not the read. Two tabs carrying the same
     * session id can resume at once — co-op takes no join lock — and both read
     * the stash before either delete lands, so a read-then-return would hand
     * the same score to both. Redis runs the deletes one at a time and reports
     * how many fields each one actually removed, so the caller that removed
     * nothing lost the race and leaves with 0.
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
