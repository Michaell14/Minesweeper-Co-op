/**
 * All daily-challenge reads and writes. Mirrors roomRepo/playerRepo, but keyed
 * by UTC date + an opaque client token, since this is NOT a room (keys.js).
 * Nothing outside this file builds a `daily:` key by hand.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const { withLock } = require('./locks');
const {
    dailyBoardKey,
    dailyLeaderboardKey,
    dailyAttemptKey,
    dailyGenLockKey,
    dailyStartLockKey,
    dailyActionLockKey,
    DAILY_TTL_SECONDS,
    LOCK_TTL_SECONDS,
} = require('./keys');

/** The attempt has reached today's one allowed outcome. Shared by game/daily.js and dailyController.js. */
const TERMINAL_STATUSES = ['failed', 'won_pending_submit', 'completed'];

// --- Board template -----------------------------------------------------

/** The day's generated template. Returns {} if not yet generated. */
const getBoardState = async (date) => {
    const client = await redisClient;
    return await client.hGetAll(dailyBoardKey(date));
};

/** Writes the template hash and starts its TTL. */
const saveBoardState = async (date, { board, seed, numRows, numCols, numMines, openedCells, startRow, startCol }) => {
    const client = await redisClient;
    await client.hSet(dailyBoardKey(date), {
        board: JSON.stringify(board),
        seed: String(seed),
        numRows: numRows.toString(),
        numCols: numCols.toString(),
        numMines: numMines.toString(),
        openedCells: openedCells.toString(),
        startRow: startRow.toString(),
        startCol: startCol.toString(),
    });
    await client.expire(dailyBoardKey(date), DAILY_TTL_SECONDS);
};

// --- Attempts ------------------------------------------------------------

/** One player's attempt for the day. Returns {} if they have not started one. */
const getAttempt = async (date, token) => {
    const client = await redisClient;
    return await client.hGetAll(dailyAttemptKey(date, token));
};

/** Creates a fresh attempt in 'ready' status and starts its TTL. */
const createAttempt = async (date, token, { board, socketId }) => {
    const client = await redisClient;
    await client.hSet(dailyAttemptKey(date, token), {
        status: 'ready',
        board: JSON.stringify(board),
        name: '',
        startedAt: '',
        finishedAt: '',
        elapsedMs: '',
        milestones: '[]',
        socketId: socketId || '',
    });
    await client.expire(dailyAttemptKey(date, token), DAILY_TTL_SECONDS);
};

const setAttemptFields = async (date, token, fields) => {
    const client = await redisClient;
    return await client.hSet(dailyAttemptKey(date, token), fields);
};

/** Flips 'ready' -> 'in_progress' and stamps when the clock actually started. */
const markStarted = (date, token, startedAt) =>
    setAttemptFields(date, token, { status: 'in_progress', startedAt: startedAt.toString() });

/**
 * Persists this player's board copy (mirrors roomRepo.setPvpBoard). Pace
 * milestones ride the SAME hSet, so a failed board write cannot leave
 * milestone stamps from a move that never completed.
 */
const setAttemptBoard = (date, token, board, milestones = null) =>
    setAttemptFields(date, token, {
        board: JSON.stringify(board),
        ...(milestones ? { milestones: JSON.stringify(milestones) } : {}),
    });

/** Hit a mine: run over for the day, no leaderboard entry. */
const markFailed = (date, token, finishedAt, elapsedMs) =>
    setAttemptFields(date, token, {
        status: 'failed',
        finishedAt: finishedAt.toString(),
        elapsedMs: elapsedMs.toString(),
    });

/** Cleared the board: awaiting the name-entry submit before it counts. */
const markWon = (date, token, finishedAt, elapsedMs) =>
    setAttemptFields(date, token, {
        status: 'won_pending_submit',
        finishedAt: finishedAt.toString(),
        elapsedMs: elapsedMs.toString(),
    });

/**
 * Records the name and adds the token to the leaderboard, scored by the
 * elapsedMs markWon stored — never a caller value. `avatar` is denormalised at
 * submit like the name, since the account may rename or vanish later; absence
 * IS the null, Redis hashes holding strings only.
 */
const submitScore = async (date, token, name, avatar = null) => {
    const client = await redisClient;
    const elapsedMs = await client.hGet(dailyAttemptKey(date, token), 'elapsedMs');
    await client.hSet(dailyAttemptKey(date, token), {
        name,
        status: 'completed',
        ...(avatar ? { avatar } : {}),
    });
    await client.zAdd(dailyLeaderboardKey(date), { score: parseInt(elapsedMs, 10), value: token });
    await client.expire(dailyLeaderboardKey(date), DAILY_TTL_SECONDS);
    return parseInt(elapsedMs, 10);
};

// --- Leaderboard -----------------------------------------------------------

/**
 * Top N, fastest first. The ZSET stores tokens (names are not unique), so each
 * entry's name and avatar are read off its attempt hash; a missing avatar is null.
 */
const getLeaderboardTop = async (date, limit = 50) => {
    const client = await redisClient;
    const ranked = await client.zRangeWithScores(dailyLeaderboardKey(date), 0, limit - 1);
    const entries = await Promise.all(
        ranked.map(async ({ value: token, score }, index) => {
            const [name, avatar] = await client.hmGet(dailyAttemptKey(date, token), ['name', 'avatar']);
            return { name, avatar: avatar || null, elapsedMs: score, rank: index + 1 };
        })
    );
    return entries;
};

/** 1-based rank, or null if this token has no leaderboard entry. */
const getRank = async (date, token) => {
    const client = await redisClient;
    const index = await client.zRank(dailyLeaderboardKey(date), token);
    return index === null || index === undefined ? null : index + 1;
};

const getEntryCount = async (date) => {
    const client = await redisClient;
    return await client.zCard(dailyLeaderboardKey(date));
};

// --- Locks -------------------------------------------------------------

/**
 * SET NX EX: truthy only for the winner. The gen lock is an optimisation (two
 * racers compute the identical board); the start lock is real, since the
 * token is shared across every tab through localStorage.
 */
const acquireLock = async (key, owner) => {
    const client = await redisClient;
    return await client.set(key, owner, { NX: true, EX: LOCK_TTL_SECONDS });
};

const releaseLock = async (key) => {
    const client = await redisClient;
    return await client.del(key);
};

const acquireGenLock = (date, owner) => acquireLock(dailyGenLockKey(date), owner);
const releaseGenLock = (date) => releaseLock(dailyGenLockKey(date));

const acquireStartLock = (date, token) => acquireLock(dailyStartLockKey(date, token), token);
const releaseStartLock = (date, token) => releaseLock(dailyStartLockKey(date, token));

/**
 * Serialises one attempt's moves. Per attempt: the only contention is one
 * player's own tabs. Callers must read the attempt INSIDE `fn`.
 */
const withAttemptLock = (date, token, owner, fn) =>
    withLock(dailyActionLockKey(date, token), owner, fn);

module.exports = {
    TERMINAL_STATUSES,
    withAttemptLock,
    getBoardState,
    saveBoardState,
    getAttempt,
    createAttempt,
    markStarted,
    setAttemptBoard,
    markFailed,
    markWon,
    submitScore,
    getLeaderboardTop,
    getRank,
    getEntryCount,
    acquireGenLock,
    releaseGenLock,
    acquireStartLock,
    releaseStartLock,
};
