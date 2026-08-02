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
    actionLockKey,
    pvpActionLockKey,
    pvpPlayerFields,
    ROOM_TTL_SECONDS,
    ROOM_GRACE_PERIOD_SECONDS,
    LOCK_TTL_SECONDS,
    ACTION_LOCK_TTL_SECONDS,
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
const acquireLock = async (key, owner, ttlSeconds = LOCK_TTL_SECONDS) => {
    const client = await redisClient;
    return await client.set(key, owner, { NX: true, EX: ttlSeconds });
};

const releaseLock = async (key) => {
    const client = await redisClient;
    return await client.del(key);
};

const acquireInitLock = (room, owner) => acquireLock(initLockKey(room), owner);
const releaseInitLock = (room) => releaseLock(initLockKey(room));

const acquireWinnerLock = (room, owner) => acquireLock(winnerLockKey(room), owner);
const releaseWinnerLock = (room) => releaseLock(winnerLockKey(room));

const acquireActionLock = (room, owner) =>
    acquireLock(actionLockKey(room), owner, ACTION_LOCK_TTL_SECONDS);
const releaseActionLock = (room) => releaseLock(actionLockKey(room));

const acquirePvpActionLock = (room, playerIndex, owner) =>
    acquireLock(pvpActionLockKey(room, playerIndex), owner, ACTION_LOCK_TTL_SECONDS);
const releasePvpActionLock = (room, playerIndex) =>
    releaseLock(pvpActionLockKey(room, playerIndex));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backoff for a contended action lock: quick first, then out of Redis's way. */
const ACTION_LOCK_FIRST_RETRY_MS = 5;
const ACTION_LOCK_MAX_RETRY_MS = 50;

/**
 * Longer than the lease deliberately, so a holder that died mid-move costs the
 * next move its lease rather than wedging the room: once the lease expires the
 * key is gone and the next acquire succeeds.
 */
const ACTION_LOCK_MAX_WAIT_MS = (ACTION_LOCK_TTL_SECONDS + 2) * 1000;

/**
 * Runs `fn` with an action lock held.
 *
 * A board lives in ONE hash field, so every move rewrites all of it. Two moves
 * that overlap both read before either writes, and the second write erases the
 * first's reveals — with no error, and with both sets of updates already sent to
 * the clients. This is what makes a move's read-modify-write atomic; callers
 * must do their reads INSIDE `fn`, since anything read before the lock was held
 * is exactly the stale snapshot the lock exists to prevent acting on.
 *
 * A contender waits rather than being dropped: the player made that move and it
 * has to land. If the wait is exhausted, Redis itself is unhealthy — `fn` then
 * runs unlocked, which is what happened before this lock existed and is better
 * than discarding the move.
 *
 * NOT reentrant. `fn` must not call anything that takes the same key. Holding
 * two different action locks at once is fine and `pvpRematch` does it, but they
 * have to be taken in a consistent order.
 */
const withLock = async (key, owner, fn) => {
    const deadline = Date.now() + ACTION_LOCK_MAX_WAIT_MS;
    let retryMs = ACTION_LOCK_FIRST_RETRY_MS;
    let held = false;

    do {
        held = Boolean(await acquireLock(key, owner, ACTION_LOCK_TTL_SECONDS));
        if (held) break;
        await sleep(retryMs);
        retryMs = Math.min(retryMs * 2, ACTION_LOCK_MAX_RETRY_MS);
    } while (Date.now() < deadline);

    if (!held) {
        console.error(`Lock ${key} never came free; running unlocked`);
    }

    try {
        return await fn();
    } finally {
        if (held) await releaseLock(key);
    }
};

/** Serialises co-op moves, which all share the room's single board. */
const withActionLock = (room, owner, fn) => withLock(actionLockKey(room), owner, fn);

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
    getBoard,
    setBoard,
    setPvpBoard,
    acquireInitLock,
    releaseInitLock,
    acquireWinnerLock,
    releaseWinnerLock,
    acquireActionLock,
    releaseActionLock,
    acquirePvpActionLock,
    releasePvpActionLock,
    withActionLock,
    withPvpActionLock,
};
