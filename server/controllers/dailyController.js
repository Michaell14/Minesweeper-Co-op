/**
 * Daily challenge lifecycle: start, submit, leaderboard reads. Per-cell actions
 * live in game/daily.js, the same split coop/pvp use.
 */

const { projectBoard } = require('../domain/board');
const { parseMilestones } = require('../domain/pace');
const { generateDailyBoardForDate } = require('../game/daily');
const dailyRepo = require('../data/dailyRepo');
const userRepo = require('../data/userRepo');
const { TERMINAL_STATUSES } = dailyRepo;
const { isValidAvatarId, isValidDailyToken, isValidPlayerName, normalizePlayerName } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * The server's own day boundary, UTC midnight. Date.now() rather than `new Date()`
 * so one jest.spyOn controls this and the elapsedMs timestamps in game/daily.js.
 */
const todayUtc = () => new Date(Date.now()).toISOString().slice(0, 10);

/** Socket.io room for live leaderboard fan-out, unrelated to the Redis `room:` hash. */
const dailyLeaderboardChannel = (date) => `daily-lb:${date}`;

const parseBoard = (raw) => (raw ? JSON.parse(raw) : null);
const parseIntOrUndefined = (raw) => {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : n;
};

/**
 * Lazily generates and caches the day's board. The lock is a thundering-herd
 * optimisation only: generation is a pure function of `date`.
 */
const ensureDailyBoard = async (date) => {
    let boardState = await dailyRepo.getBoardState(date);
    if (boardState && boardState.board) return boardState;

    const lockAcquired = await dailyRepo.acquireGenLock(date, 'gen');
    if (lockAcquired) {
        try {
            await dailyRepo.saveBoardState(date, generateDailyBoardForDate(date));
        } finally {
            await dailyRepo.releaseGenLock(date);
        }
        return await dailyRepo.getBoardState(date);
    }

    // Lost the race: poll briefly for the winner's result.
    for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        boardState = await dailyRepo.getBoardState(date);
        if (boardState && boardState.board) return boardState;
    }

    // Still nothing after ~2s (holder crashed?): generate locally; it is deterministic anyway.
    await dailyRepo.saveBoardState(date, generateDailyBoardForDate(date));
    return await dailyRepo.getBoardState(date);
};

/**
 * Reads (or creates) the attempt and emits dailyAlreadyAttempted or dailyStarted
 * to fit. Only called under the (date, token) start lock, so two callers can
 * never both create a fresh attempt.
 */
const emitStartResult = async ({ socket, date, boardState, numRows, numCols, numMines, totalSafeCells }, dailyAttemptToken) => {
    const attempt = await dailyRepo.getAttempt(date, dailyAttemptToken);

    if (attempt && attempt.status && TERMINAL_STATUSES.includes(attempt.status)) {
        // Only a completed (submitted) attempt has a rank; totalEntries rides along for the share text.
        const isCompleted = attempt.status === 'completed';
        const rank = isCompleted ? await dailyRepo.getRank(date, dailyAttemptToken) : null;
        const totalEntries = isCompleted ? await dailyRepo.getEntryCount(date) : null;
        // The FINAL board rides along for a view-only replay; a terminal state
        // may reveal everything (ARCHITECTURE.md §3.1). Older attempts have none.
        const finalBoard = parseBoard(attempt.board);
        socket.emit(SERVER_EVENTS.DAILY_ALREADY_ATTEMPTED, {
            date,
            status: attempt.status,
            elapsedMs: parseIntOrUndefined(attempt.elapsedMs),
            rank: rank === null ? undefined : rank,
            totalEntries: totalEntries === null ? undefined : totalEntries,
            board: finalBoard ? projectBoard(finalBoard, { revealMines: true }) : undefined,
            // For the share text's pace bar. Pre-pace attempts parse to [],
            // which the client treats as "no bar".
            milestones: parseMilestones(attempt.milestones),
            numRows,
            numCols,
            numMines,
        });
        return;
    }

    if (attempt && attempt.status) {
        // Resume: same board and the ORIGINAL startedAt, so the timer picks up
        // true elapsed time. This is the real backstop for one-per-day.
        socket.emit(SERVER_EVENTS.DAILY_STARTED, {
            date,
            board: projectBoard(parseBoard(attempt.board)),
            numRows,
            numCols,
            numMines,
            totalSafeCells,
            startedAt: parseIntOrUndefined(attempt.startedAt) ?? null,
        });
        return;
    }

    // Fresh attempt: consumes the day's one attempt immediately, moves or not.
    const templateBoard = parseBoard(boardState.board);
    await dailyRepo.createAttempt(date, dailyAttemptToken, { board: templateBoard, socketId: socket.id });
    socket.emit(SERVER_EVENTS.DAILY_STARTED, {
        date,
        board: projectBoard(templateBoard),
        numRows,
        numCols,
        numMines,
        totalSafeCells,
        startedAt: null,
    });
};

/** Handles 'startDaily'. */
const startDaily = async ({ socket, dailyAttemptToken }) => {
    try {
        if (!isValidDailyToken(dailyAttemptToken)) return;
        const date = todayUtc();

        const boardState = await ensureDailyBoard(date);
        const numRows = parseInt(boardState.numRows, 10);
        const numCols = parseInt(boardState.numCols, 10);
        const numMines = parseInt(boardState.numMines, 10);
        const totalSafeCells = numRows * numCols - numMines;
        const ctx = { socket, date, boardState, numRows, numCols, numMines, totalSafeCells };

        const lockAcquired = await dailyRepo.acquireStartLock(date, dailyAttemptToken);
        if (!lockAcquired) {
            // A second tab (the token is shared via localStorage) is already
            // resolving the attempt; wait for it rather than create a second.
            for (let i = 0; i < 20; i++) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                const attempt = await dailyRepo.getAttempt(date, dailyAttemptToken);
                if (attempt && attempt.status) {
                    await emitStartResult(ctx, dailyAttemptToken);
                    return;
                }
            }
            // Lock holder never wrote (crashed?): proceed best-effort, as ensureDailyBoard does.
            await emitStartResult(ctx, dailyAttemptToken);
            return;
        }

        try {
            await emitStartResult(ctx, dailyAttemptToken);
        } finally {
            await dailyRepo.releaseStartLock(date, dailyAttemptToken);
        }
    } catch (error) {
        console.error('Error in startDaily:', error);
    }
};

/** Handles 'submitDailyScore'. Only a 'won_pending_submit' attempt can submit. */
const submitDailyScore = async ({ socket, io, dailyAttemptToken, date, name }) => {
    try {
        // Validate what gets STORED, not what arrived. A signed-in player's entry
        // carries their ACCOUNT name, RE-READ here rather than taken from the
        // socket: socket.data.user is a connect-time snapshot, and the
        // leaderboard is the one durable public place a stale rename would land.
        // Postgres down keeps the snapshot; account gone falls through to the
        // typed name, normalised through the same gate either way.
        let accountName = socket.data?.user?.displayName;
        let accountAvatar = socket.data?.user?.avatar;
        if (socket.data?.user?.id) {
            try {
                const fresh = await userRepo.getUserById(socket.data.user.id);
                accountName = fresh ? fresh.displayName : null;
                accountAvatar = fresh ? fresh.avatar : null;
            } catch {
                // Best-effort: the snapshot beats blocking a submit.
            }
        }
        const displayName = normalizePlayerName(accountName || name);
        if (!isValidDailyToken(dailyAttemptToken) || !isValidPlayerName(displayName)) return;

        // The avatar rides only with an ACCOUNT entry (a deleted account fell
        // through to the typed name), and isValidAvatarId drops a retired id.
        const avatar = accountName && isValidAvatarId(accountAvatar) ? accountAvatar : null;

        const attempt = await dailyRepo.getAttempt(date, dailyAttemptToken);
        if (!attempt || attempt.status !== 'won_pending_submit') return;

        const elapsedMs = await dailyRepo.submitScore(date, dailyAttemptToken, displayName, avatar);
        const rank = await dailyRepo.getRank(date, dailyAttemptToken);
        const totalEntries = await dailyRepo.getEntryCount(date);

        socket.emit(SERVER_EVENTS.DAILY_SCORE_SUBMITTED, { rank, elapsedMs, totalEntries });

        // Join before broadcasting: the submitter may never have asked for the leaderboard.
        socket.join(dailyLeaderboardChannel(date));
        const entries = await dailyRepo.getLeaderboardTop(date);
        io.to(dailyLeaderboardChannel(date)).emit(SERVER_EVENTS.DAILY_LEADERBOARD_UPDATE, { entries });
    } catch (error) {
        console.error('Error in submitDailyScore:', error);
    }
};

/** Handles 'getDailyLeaderboard'. Joins the live-update channel for that date. */
const getDailyLeaderboard = async ({ socket, date }) => {
    try {
        socket.join(dailyLeaderboardChannel(date));
        const entries = await dailyRepo.getLeaderboardTop(date);
        socket.emit(SERVER_EVENTS.DAILY_LEADERBOARD_UPDATE, { entries });
    } catch (error) {
        console.error('Error in getDailyLeaderboard:', error);
    }
};

module.exports = { startDaily, submitDailyScore, getDailyLeaderboard, dailyLeaderboardChannel };
