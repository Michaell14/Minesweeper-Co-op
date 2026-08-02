/**
 * All daily-challenge reads and writes.
 *
 * Mirrors roomRepo/playerRepo's shape (raw hash reads, callers get parsed
 * values back), but addresses state by UTC date + an opaque client-generated
 * token instead of a room code / socket id — this is deliberately NOT a room
 * (see keys.js for why). Nothing outside this file should build a `daily:`
 * key by hand.
 */

const { redisClient } = require('../utils/initializeRedisClient');
const {
    dailyBoardKey,
    dailyLeaderboardKey,
    dailyAttemptKey,
    dailyGenLockKey,
    dailyStartLockKey,
    DAILY_TTL_SECONDS,
    LOCK_TTL_SECONDS,
} = require('./keys');

/**
 * The attempt status vocabulary. An attempt in any of these has reached
 * today's one allowed outcome -- game/daily.js and controllers/dailyController.js
 * both gate core logic on this list, so it lives here once rather than as two
 * copies that could drift.
 */
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

/** Persists this player's mutating board copy, mirrors roomRepo.setPvpBoard. */
const setAttemptBoard = (date, token, board) =>
    setAttemptFields(date, token, { board: JSON.stringify(board) });

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
 * Records the player's chosen name and adds them to the leaderboard, keyed by
 * their existing elapsedMs (set by markWon — this never trusts a fresh value
 * from the caller, since the score must come from the server timestamps).
 */
const submitScore = async (date, token, name) => {
    const client = await redisClient;
    const elapsedMs = await client.hGet(dailyAttemptKey(date, token), 'elapsedMs');
    await client.hSet(dailyAttemptKey(date, token), { name, status: 'completed' });
    await client.zAdd(dailyLeaderboardKey(date), { score: parseInt(elapsedMs, 10), value: token });
    await client.expire(dailyLeaderboardKey(date), DAILY_TTL_SECONDS);
    return parseInt(elapsedMs, 10);
};

// --- Leaderboard -----------------------------------------------------------

/**
 * Top N entries, fastest first. The ZSET stores tokens (names aren't unique),
 * so this batch-reads each entry's display name off its attempt hash.
 */
const getLeaderboardTop = async (date, limit = 50) => {
    const client = await redisClient;
    const ranked = await client.zRangeWithScores(dailyLeaderboardKey(date), 0, limit - 1);
    const entries = await Promise.all(
        ranked.map(async ({ value: token, score }, index) => ({
            name: await client.hGet(dailyAttemptKey(date, token), 'name'),
            elapsedMs: score,
            rank: index + 1,
        }))
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
 * SET NX EX: returns truthy only for the caller that won the race.
 *
 * The gen lock is an optimization only, not a correctness requirement like
 * PVP's init/winner locks -- two racers generating the same seed compute the
 * identical board, so a missed lock just wastes CPU. The start lock exists
 * because localStorage (and so the attempt token) is shared across every tab
 * of one browser, so two tabs racing `startDaily` for the same token is a
 * real scenario worth serialising.
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

module.exports = {
    TERMINAL_STATUSES,
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
