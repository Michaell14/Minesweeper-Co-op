/**
 * All room reads and writes. Callers pass a room CODE, never a key, and get
 * parsed values back (boards and player lists as arrays). Every hash value is
 * a string; booleans are 'true'/'false'.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { acquireLock, releaseLock, withLock } = require('./locks');
const {
    roomKey,
    initLockKey,
    winnerLockKey,
    actionLockKey,
    pvpActionLockKey,
    joinLockKey,
    pvpPlayerFields,
    ROOM_TTL_SECONDS,
    ROOM_GRACE_PERIOD_SECONDS,
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

/** Shortens an emptied room's lifetime instead of deleting it, so a dropped player can reconnect. */
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

/**
 * Which PVP slot a socket holds according to the ROOM, or undefined. Distinct
 * from `domain/pvpPlayer.js`'s `pvpIndexOf`, which asks the PLAYER record; a
 * reconnect deletes that record, so the room is the only place that remembers.
 */
const pvpSlotOf = (roomState, socketId) => {
    if (!roomState) return undefined;
    return [0, 1].find((index) => roomState[pvpPlayerFields(index).socketKey] === socketId);
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

/* Mechanics live in data/locks.js; only which KEY each situation locks belongs here. */

const acquireInitLock = (room, owner) => acquireLock(initLockKey(room), owner);
const releaseInitLock = (room) => releaseLock(initLockKey(room));

const acquireWinnerLock = (room, owner) => acquireLock(winnerLockKey(room), owner);
const releaseWinnerLock = (room) => releaseLock(winnerLockKey(room));

/** Serialises co-op moves, which all share the room's single board. */
const withActionLock = (room, owner, fn) => withLock(actionLockKey(room), owner, fn);

/**
 * Serialises a PVP join. Its own key rather than the action lock's: a join is
 * not a board write, and an unstarted lobby has no moves to wait behind.
 */
const withJoinLock = (room, owner, fn) => withLock(joinLockKey(room), owner, fn);

/**
 * Serialises ONE PVP player's moves. Per player rather than per room, because
 * the two players own separate board fields and racing each other is the game.
 */
const withPvpActionLock = (room, playerIndex, owner, fn) =>
    withLock(pvpActionLockKey(room, playerIndex), owner, fn);

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
    pvpSlotOf,
    getBoard,
    setBoard,
    setPvpBoard,
    acquireInitLock,
    releaseInitLock,
    acquireWinnerLock,
    releaseWinnerLock,
    withActionLock,
    withPvpActionLock,
    withJoinLock,
};
