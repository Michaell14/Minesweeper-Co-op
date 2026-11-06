/**
 * All room reads and writes. Callers pass a room CODE, never a key, and get
 * parsed values back (boards and player lists as arrays). Every hash value is
 * a string; booleans are 'true'/'false'.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { encodeBoard, decodeBoard } = require('../domain/boardCodec');
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

/**
 * Only the named fields, shaped like `getState`'s answer: a field the hash
 * lacks is absent rather than null, and a missing room reads as {}. For any
 * read that does not need a board — the whole hash carries every board in the
 * room (three in PVP), and fetching it per hover and several times per click
 * was most of the server's Redis bandwidth.
 */
const getFields = async (room, fields) => {
    const client = await redisClient;
    const values = (await client.hmGet(roomKey(room), fields)) || [];
    const state = {};
    fields.forEach((field, i) => {
        if (values[i] !== null && values[i] !== undefined) state[field] = values[i];
    });
    return state;
};

const setFields = async (room, fields) => {
    const client = await redisClient;
    return await client.hSet(roomKey(room), fields);
};

/**
 * Writes the initial hash and starts its 24h expiry. A co-op room passes its
 * `board` as an array, stored encoded in the same write.
 */
const create = async (room, roomData, board = null) => {
    const client = await redisClient;
    await client.hSet(roomKey(room), board ? { ...roomData, board: encodeBoard(board) } : roomData);
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

/*
 * Stored encoded (domain/boardCodec.js, which still reads the old JSON) and
 * handed out as arrays: nothing above data/ sees the string. The `...From`
 * readers take a room hash already in hand, like `playersFrom`, so a move
 * decodes the board from the snapshot it read under its lock. A write takes
 * `fields` to land in the SAME HSET, for state that must change with the board.
 */

/** Co-op board (the shared one), or null. */
const getBoard = async (room) => decodeBoard(await getField(room, 'board'));

/** The co-op board from a room hash already in hand, or null. */
const boardFrom = (roomState) => decodeBoard(roomState ? roomState.board : null);

/** One PVP player's board from a room hash already in hand; null before the race is dealt. */
const pvpBoardFrom = (roomState, playerIndex) =>
    decodeBoard(roomState ? roomState[pvpPlayerFields(playerIndex).boardKey] : null);

/** The race's pristine starting board, which `resetMyBoard` restores, or null. */
const sharedBoardFrom = (roomState) => decodeBoard(roomState ? roomState.sharedBoard : null);

const setBoard = async (room, board, fields = {}) =>
    setFields(room, { ...fields, board: encodeBoard(board) });

/** One PVP player's board. */
const setPvpBoard = async (room, playerIndex, board, fields = {}) => {
    const { boardKey } = pvpPlayerFields(playerIndex);
    return setFields(room, { ...fields, [boardKey]: encodeBoard(board) });
};

/**
 * Deals a race: the same board to both players, plus the pristine copy
 * `resetMyBoard` restores. Encoded once, since all three are the same string.
 */
const dealPvpBoards = async (room, board, fields = {}) => {
    const encoded = encodeBoard(board);
    return setFields(room, {
        ...fields,
        [pvpPlayerFields(0).boardKey]: encoded,
        [pvpPlayerFields(1).boardKey]: encoded,
        sharedBoard: encoded,
    });
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
    getFields,
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
    boardFrom,
    pvpBoardFrom,
    sharedBoardFrom,
    setBoard,
    setPvpBoard,
    dealPvpBoards,
    acquireInitLock,
    releaseInitLock,
    acquireWinnerLock,
    releaseWinnerLock,
    withActionLock,
    withPvpActionLock,
    withJoinLock,
};
