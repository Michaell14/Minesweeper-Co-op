/**
 * All room reads and writes.
 *
 * Callers pass a room CODE, never a key, and get back parsed values (boards and
 * player lists come out as arrays, not JSON strings). Remember that every value
 * in the underlying hash is a string: booleans are stored as 'true'/'false' and
 * compared as such.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const {
    roomKey,
    initLockKey,
    winnerLockKey,
    pvpPlayerFields,
    ROOM_TTL_SECONDS,
    ROOM_GRACE_PERIOD_SECONDS,
    LOCK_TTL_SECONDS,
} = require('./keys');

const exists = async (room) => {
    const client = await redisClient;
    return await client.exists(roomKey(room));
};

/** The whole room hash. Returns {} for a room that does not exist. */
const getState = async (room) => {
    const client = await redisClient;
    return await client.hGetAll(roomKey(room));
};

const getField = async (room, field) => {
    const client = await redisClient;
    return await client.hGet(roomKey(room), field);
};

const setFields = async (room, fields) => {
    const client = await redisClient;
    return await client.hSet(roomKey(room), fields);
};

/** Writes the initial hash and starts its 24h expiry. */
const create = async (room, roomData) => {
    const client = await redisClient;
    await client.hSet(roomKey(room), roomData);
    await client.expire(roomKey(room), ROOM_TTL_SECONDS);
};

/** Resets the room's full lifetime, cancelling any grace period it was under. */
const touch = async (room) => {
    const client = await redisClient;
    return await client.expire(roomKey(room), ROOM_TTL_SECONDS);
};

/**
 * Shortens an emptied room's lifetime instead of deleting it, so a player who
 * dropped out can reconnect into the same room within the grace window.
 */
const startGracePeriod = async (room) => {
    const client = await redisClient;
    return await client.expire(roomKey(room), ROOM_GRACE_PERIOD_SECONDS);
};

/** Socket ids currently in the room. Always an array. */
const getPlayers = async (room) => {
    const raw = await getField(room, 'players');
    try {
        const players = JSON.parse(raw || '[]');
        return Array.isArray(players) ? players : [];
    } catch {
        return [];
    }
};

const setPlayers = async (room, players) => setFields(room, { players: JSON.stringify(players) });

/** Same parsing as getPlayers, for a room hash already in hand. */
const playersFrom = (roomState) => {
    if (!roomState) return [];
    try {
        const players = JSON.parse(roomState.players || '[]');
        return Array.isArray(players) ? players : [];
    } catch {
        return [];
    }
};

/** The other socket in a two-player room, or undefined. */
const opponentOf = async (room, socketId) => {
    const players = await getPlayers(room);
    return players.find((p) => p !== socketId);
};

// --- Boards -----------------------------------------------------------------

/** Co-op board (the shared one). */
const getBoard = async (room) => {
    const raw = await getField(room, 'board');
    return raw ? JSON.parse(raw) : null;
};

const setBoard = async (room, board) => setFields(room, { board: JSON.stringify(board) });

/** One PVP player's board. */
const setPvpBoard = async (room, playerIndex, board) => {
    const { boardKey } = pvpPlayerFields(playerIndex);
    return setFields(room, { [boardKey]: JSON.stringify(board) });
};

// --- Locks ------------------------------------------------------------------

/**
 * SET NX EX: returns truthy only for the caller that won the race. Every lock
 * carries a short TTL so a crash mid-hold cannot wedge a room permanently.
 */
const acquireLock = async (key, owner) => {
    const client = await redisClient;
    return await client.set(key, owner, { NX: true, EX: LOCK_TTL_SECONDS });
};

const releaseLock = async (key) => {
    const client = await redisClient;
    return await client.del(key);
};

const acquireInitLock = (room, owner) => acquireLock(initLockKey(room), owner);
const releaseInitLock = (room) => releaseLock(initLockKey(room));

const acquireWinnerLock = (room, owner) => acquireLock(winnerLockKey(room), owner);
const releaseWinnerLock = (room) => releaseLock(winnerLockKey(room));

module.exports = {
    exists,
    getState,
    getField,
    setFields,
    create,
    touch,
    startGracePeriod,
    getPlayers,
    setPlayers,
    playersFrom,
    opponentOf,
    getBoard,
    setBoard,
    setPvpBoard,
    acquireInitLock,
    releaseInitLock,
    acquireWinnerLock,
    releaseWinnerLock,
};
