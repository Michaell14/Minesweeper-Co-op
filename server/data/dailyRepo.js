/**
 * All daily-challenge reads and writes.
 *
 * Mirrors roomRepo/playerRepo's shape, but addresses state by UTC date + an
 * opaque client-generated token rather than a room code / socket id — this is
 * deliberately NOT a room (see keys.js). Nothing outside this file should build
 * a `daily:` key by hand.
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

/**
 * Statuses meaning the attempt has reached today's one allowed outcome. Both
 * game/daily.js and dailyController.js gate on this, so it lives here once.
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
 * Persists this player's mutating board copy, mirrors roomRepo.setPvpBoard.
 * Pace milestones ride the SAME hSet when a move crossed any (one atomic
 * write): stored separately, a board write failing after a milestone write
 * left durable pace stamps from a move that never completed.
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
 * Records the player's chosen name and adds them to the leaderboard, keyed by
 * the elapsedMs markWon already stored — never a value from the caller, since
 * the score has to come from the server's own timestamps.
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
 * The gen lock is an optimization, not a correctness requirement — two racers on
 * the same seed compute the identical board, so a missed lock only wastes CPU.
 * The start lock is real: the attempt token comes from localStorage and is
 * shared across every tab, so two tabs racing `startDaily` does happen.
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
 * Serialises one attempt's moves. Per attempt, so two players never wait on each
 * other — the contention is one player's own two tabs, which share the token
 * through localStorage.
 *
 * Callers must read the attempt INSIDE `fn`: anything read before the lock was
 * held is the stale snapshot the lock exists to guard against.
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
