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
 * to fit. Only called under the attempt action lock, so a slow start cannot
 * be bypassed by another tab or race with a move changing the same board.
 */
const emitStartResultUnderLock = async ({ socket, date, boardState, numRows, numCols, numMines, totalSafeCells }, dailyAttemptToken) => {
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

// Every path, including the start-lock polling timeout, must re-read under
// the action lock before creating or resuming an attempt.
const emitStartResult = (ctx, dailyAttemptToken) =>
    dailyRepo.withAttemptLock(ctx.date, dailyAttemptToken, ctx.socket.id, () =>
        emitStartResultUnderLock(ctx, dailyAttemptToken));

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

/** Handles 'submitDailyScore'. Completed attempts only replay their acknowledgement. */
const submitDailyScore = async ({ socket, io, dailyAttemptToken, date, name }) => {
    try {
        if (!isValidDailyToken(dailyAttemptToken)) return;
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

        // The avatar rides only with an ACCOUNT entry (a deleted account fell
        // through to the typed name), and isValidAvatarId drops a retired id.
        const avatar = accountName && isValidAvatarId(accountAvatar) ? accountAvatar : null;

        // Submission changes the attempt too. Re-read under the same lock as
        // moves, or two tabs can both pass the pending check and the second
        // overwrites the name/avatar after the first score was published.
        const submission = await dailyRepo.withAttemptLock(date, dailyAttemptToken, socket.id, async () => {
            const attempt = await dailyRepo.getAttempt(date, dailyAttemptToken);
            if (!attempt) return null;
            // A lost acknowledgement must be retryable without rewriting the
            // published identity, elapsed time, or leaderboard entry.
            if (attempt.status === 'completed') {
                const elapsedMs = parseIntOrUndefined(attempt.elapsedMs);
                return elapsedMs === undefined ? null : { elapsedMs, published: false };
            }
            if (attempt.status !== 'won_pending_submit' || !isValidPlayerName(displayName)) return null;
            const elapsedMs = await dailyRepo.submitScore(date, dailyAttemptToken, displayName, avatar);
            return { elapsedMs, published: true };
        });
        if (!submission) return;
        const { elapsedMs, published } = submission;

        const rank = await dailyRepo.getRank(date, dailyAttemptToken);
        const totalEntries = await dailyRepo.getEntryCount(date);

        socket.emit(SERVER_EVENTS.DAILY_SCORE_SUBMITTED, { rank, elapsedMs, totalEntries });

        // Join before broadcasting: the submitter may never have asked for the leaderboard.
        socket.join(dailyLeaderboardChannel(date));
        const entries = await dailyRepo.getLeaderboardTop(date);
        if (published) {
            io.to(dailyLeaderboardChannel(date)).emit(SERVER_EVENTS.DAILY_LEADERBOARD_UPDATE, { entries });
        } else {
            // A reconnect also needs the current table, but nobody else needs
            // another broadcast for a submission already published.
            socket.emit(SERVER_EVENTS.DAILY_LEADERBOARD_UPDATE, { entries });
        }
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
