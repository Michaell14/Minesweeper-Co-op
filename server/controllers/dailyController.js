/**
 * Daily challenge lifecycle: start, submit, leaderboard reads. Mirrors
 * pvpController.js's shape -- per-cell actions live in game/daily.js instead,
 * the same split coop/pvp use between controllers/ and game/.
 */

const { projectBoard } = require('../domain/board');
const { generateDailyBoardForDate } = require('../game/daily');
const dailyRepo = require('../data/dailyRepo');
const userRepo = require('../data/userRepo');
const { TERMINAL_STATUSES } = dailyRepo;
const { isValidDailyToken, isValidPlayerName, normalizePlayerName } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * The server's own day boundary -- UTC midnight, never client-supplied. Routes
 * through Date.now() rather than `new Date()` so it shares a clock with the
 * elapsedMs timestamps in game/daily.js, and one jest.spyOn controls both.
 */
const todayUtc = () => new Date(Date.now()).toISOString().slice(0, 10);

/** Socket.io room for fanning out live leaderboard updates -- unrelated to the
 * Redis `room:` hash. */
const dailyLeaderboardChannel = (date) => `daily-lb:${date}`;

const parseBoard = (raw) => (raw ? JSON.parse(raw) : null);
const parseIntOrUndefined = (raw) => {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : n;
};

/**
 * Lazily generates and caches the day's board on first request. The lock is a
 * thundering-herd optimization, not a correctness requirement: generation is a
 * pure function of `date`, so two racers converge on the identical board.
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

    // Lost the race: poll briefly for the winner's result rather than
    // generating a redundant copy immediately.
    for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        boardState = await dailyRepo.getBoardState(date);
        if (boardState && boardState.board) return boardState;
    }

    // Still nothing after ~2s (lock holder crashed?) -- generate locally, which
    // is deterministic and so converges to the same board anyway.
    await dailyRepo.saveBoardState(date, generateDailyBoardForDate(date));
    return await dailyRepo.getBoardState(date);
};

/**
 * Reads (or creates) the attempt and emits whichever of
 * dailyAlreadyAttempted/dailyStarted fits its status. Only ever called under the
 * start lock for (date, token), so two callers for the same token can never both
 * reach the "create a fresh attempt" branch.
 */
const emitStartResult = async ({ socket, date, boardState, numRows, numCols, numMines, totalSafeCells }, dailyAttemptToken) => {
    const attempt = await dailyRepo.getAttempt(date, dailyAttemptToken);

    if (attempt && attempt.status && TERMINAL_STATUSES.includes(attempt.status)) {
        // Only a completed (submitted) attempt has a leaderboard rank -- and
        // totalEntries alongside it, for the share-result text ("beat 44
        // others") on a resumed session.
        const isCompleted = attempt.status === 'completed';
        const rank = isCompleted ? await dailyRepo.getRank(date, dailyAttemptToken) : null;
        const totalEntries = isCompleted ? await dailyRepo.getEntryCount(date) : null;
        socket.emit(SERVER_EVENTS.DAILY_ALREADY_ATTEMPTED, {
            date,
            status: attempt.status,
            elapsedMs: parseIntOrUndefined(attempt.elapsedMs),
            rank: rank === null ? undefined : rank,
            totalEntries: totalEntries === null ? undefined : totalEntries,
        });
        return;
    }

    if (attempt && attempt.status) {
        // Resume: same board, and crucially the ORIGINAL startedAt, so the timer
        // picks up true elapsed time rather than restarting at 0. This -- not the
        // client's localStorage flag -- is the real backstop for one-per-day.
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

    // Fresh attempt -- consumes the day's one attempt immediately, even if
    // the player never makes a move (per product decision).
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
            // Another request for this token -- a second tab, since the token is
            // shared via localStorage -- is already resolving the attempt. Wait
            // for it rather than racing to create a second one.
            for (let i = 0; i < 20; i++) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                const attempt = await dailyRepo.getAttempt(date, dailyAttemptToken);
                if (attempt && attempt.status) {
                    await emitStartResult(ctx, dailyAttemptToken);
                    return;
                }
            }
            // Lock holder never wrote anything (crashed?) -- proceed best-effort
            // rather than leave the player stuck, as ensureDailyBoard does.
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
        // Validate what gets STORED, not what arrived: the leaderboard is the one
        // durable public thing here, and today's entry is not rewritable.
        // A signed-in player's entry carries their ACCOUNT name (the PRD's
        // daily tie-in) — RE-READ here rather than trusted from the socket,
        // because socket.data.user is a connect-time snapshot and this is the
        // one durable public place a stale rename (or a deleted account's
        // ghost) would be carved into. Postgres down keeps the snapshot;
        // account gone falls through to the typed name. Normalised through
        // the same gate as a typed one either way — an OAuth-seeded name is
        // still arbitrary input.
        let accountName = socket.data?.user?.displayName;
        if (socket.data?.user?.id) {
            try {
                const fresh = await userRepo.getUserById(socket.data.user.id);
                accountName = fresh ? fresh.displayName : null;
            } catch {
                // Best-effort: the snapshot is better than blocking a submit.
            }
        }
        const displayName = normalizePlayerName(accountName || name);
        if (!isValidDailyToken(dailyAttemptToken) || !isValidPlayerName(displayName)) return;

        const attempt = await dailyRepo.getAttempt(date, dailyAttemptToken);
        if (!attempt || attempt.status !== 'won_pending_submit') return;

        const elapsedMs = await dailyRepo.submitScore(date, dailyAttemptToken, displayName);
        const rank = await dailyRepo.getRank(date, dailyAttemptToken);
        const totalEntries = await dailyRepo.getEntryCount(date);

        socket.emit(SERVER_EVENTS.DAILY_SCORE_SUBMITTED, { rank, elapsedMs, totalEntries });

        // Join before broadcasting: the submitter may never have called
        // getDailyLeaderboard, and must still receive this update.
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
