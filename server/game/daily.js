/**
 * Daily challenge: one seeded board, identical for every player, ranked by
 * server-authoritative completion time. NOT a room — see data/keys.js for why.
 *
 * Generation mirrors pvpController's buildSharedBoard — generate once around a
 * fixed center cell, open it up front, hand every player the identical result —
 * but draws from a seed derived from the date rather than Math.random(), once
 * per day rather than once per room.
 */

const { generateSingleCandidateBoard } = require('../domain/boardGen');
const { solveWithStats } = require('../domain/solverUtils');
const { revealFrom, getAdjacentCells, projectBoard, projectCells } = require('../domain/board');
const { withCrossedMilestones } = require('../../shared/pace');
const { parseMilestones } = require('../domain/pace');
const { hashStringToSeed, mulberry32 } = require('../domain/seededRandom');
const { io } = require('../utils/initializeClient');
const { recordForSockets, boardKeyOf } = require('../utils/statsRecorder');
const dailyRepo = require('../data/dailyRepo');
const { TERMINAL_STATUSES } = dailyRepo;
const { SERVER_EVENTS } = require('../../shared/events');
const { DAILY_PRESET } = require('../../shared/boardConfig');

/**
 * Safety net on the raw candidate count, for an unlucky seed. Generation runs
 * once a day, not per click, so it can afford to be generous — roughly 10x the
 * ~430 candidates expected to fill DAILY_CANDIDATE_POOL_SIZE at this density.
 */
const DAILY_MAX_ATTEMPTS = 5000;

/**
 * How many solvable candidates to sample before keeping the hardest. "Hardest"
 * means the one that needed the most subset/overlap reasoning rather than easy
 * single-cell deductions — see solveWithStats. A pool of 1 is what the daily
 * used to do (first solvable board wins); this turns "solvable" into "hard"
 * without changing what solvable means.
 */
const DAILY_CANDIDATE_POOL_SIZE = 30;

const dailySeedString = (date) => `minesweeper-daily:${date}`;

/**
 * Draws candidates from `rng` until DAILY_CANDIDATE_POOL_SIZE solvable ones are
 * found (or DAILY_MAX_ATTEMPTS is exhausted), and returns whichever needed the
 * most Rule 2 (subset-reduction) steps. Ties keep the first found, so the result
 * stays a pure function of the seed. Null if no candidate was ever solvable.
 */
const hardestSolvableCandidate = (rows, cols, mines, startRow, startCol, rng) => {
    let best = null;
    let solvableFound = 0;

    for (let attempt = 0; attempt < DAILY_MAX_ATTEMPTS && solvableFound < DAILY_CANDIDATE_POOL_SIZE; attempt++) {
        const candidate = generateSingleCandidateBoard(rows, cols, mines, startRow, startCol, rng);
        const { solvable, rule2Count } = solveWithStats(candidate, startRow, startCol);
        if (!solvable) continue;

        solvableFound++;
        if (!best || rule2Count > best.rule2Count) {
            best = { board: candidate, rule2Count };
        }
    }

    return best;
};

/**
 * Builds the day's board: deterministic from `date` alone, no-guess verified,
 * opened at a fixed center cell (same shape as PVP's shared board).
 *
 * Regular rooms accept the FIRST solvable candidate, which is not necessarily
 * hard. This samples a pool from the same deterministic seed and keeps the one
 * that demanded the most reasoning — which board gets picked, not what
 * "solvable" means.
 *
 * A failing daily seed would fail identically forever, so this throws rather
 * than hand out an unverified board; deterministic fallback seeds are tried
 * first, in order.
 */
const generateDailyBoardForDate = (date) => {
    const { rows, cols, mines } = DAILY_PRESET;
    const startRow = Math.floor(rows / 2);
    const startCol = Math.floor(cols / 2);

    const seedCandidates = [
        dailySeedString(date),
        `${dailySeedString(date)}:fallback-1`,
        `${dailySeedString(date)}:fallback-2`,
    ];

    for (const seedString of seedCandidates) {
        const seed = hashStringToSeed(seedString);
        const rng = mulberry32(seed);
        const result = hardestSolvableCandidate(rows, cols, mines, startRow, startCol, rng);

        if (result) {
            const { board } = result;
            const { cellsRevealed } = revealFrom(board, startRow, startCol, []);
            return { board, seed, numRows: rows, numCols: cols, numMines: mines, startRow, startCol, openedCells: cellsRevealed };
        }
    }

    throw new Error(`[daily] no solvable board found for ${date} after ${seedCandidates.length} seeds`);
};

/**
 * Stamps the server-authoritative start of the clock, the first time an
 * attempt sees a real move (open or chord) rather than at attempt-creation.
 * Idempotent: once `in_progress`, this is a no-op and the ORIGINAL startedAt
 * is what a refresh resumes from, never a fresh one.
 *
 * Returns the effective startedAt either way — on the first move the stamp it
 * just wrote, after that the stored one — so callers can compute an elapsed
 * time for pace milestones without re-reading the attempt.
 */
const markStartedIfNeeded = async (date, token, attempt) => {
    if (attempt.status === 'ready') {
        const startedAt = Date.now();
        await dailyRepo.markStarted(date, token, startedAt);
        return startedAt;
    }
    const startedAt = parseInt(attempt.startedAt, 10);
    // A blank stamp shouldn't exist alongside in_progress (markStarted writes
    // both in one hSet), but NaN here would poison every later milestone.
    return Number.isFinite(startedAt) ? startedAt : Date.now();
};

/**
 * Records any pace deciles this move crossed (see shared/pace.js). Persisted
 * BEFORE the win check: finishAttempt re-reads the attempt, and the winning
 * move's own crossings — always at least the run to 100% — must be there for
 * the terminal emit to carry them.
 *
 * A failure here rejects the move rather than being swallowed — deliberate:
 * the board write right after it shares the same Redis and lock, so a blip
 * would doom the move anyway.
 */
const recordPaceIfCrossed = async (date, token, attempt, board, startedAt) => {
    const before = parseMilestones(attempt.milestones);
    const milestones = withCrossedMilestones(before, board, Date.now() - startedAt);
    if (milestones.length > before.length) {
        await dailyRepo.setAttemptMilestones(date, token, milestones);
    }
};

/**
 * Ends today's attempt, win or loss: computes elapsedMs from the two server
 * timestamps (never a client-supplied value), reveals the full board and
 * notifies this socket. A win does not touch the leaderboard yet — that happens
 * at submitScore, once the player has supplied a name.
 */
const finishAttempt = async (date, token, socketId, board, { won }) => {
    const attempt = await dailyRepo.getAttempt(date, token);
    // Re-check rather than trust the caller's read: two near-simultaneous moves
    // for the same token (two tabs) could both pass openCell/chordCell's own
    // terminal check before either wrote, so only the first here emits a result.
    if (!attempt || TERMINAL_STATUSES.includes(attempt.status)) return;

    const startedAt = parseInt(attempt.startedAt, 10);
    const finishedAt = Date.now();
    const elapsedMs = finishedAt - startedAt;

    if (won) {
        // Auto-flag the remaining mines, same as gameUtils.checkWin does.
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
                if (board[r][c].isMine) board[r][c].isFlagged = true;
            }
        }
        await dailyRepo.markWon(date, token, finishedAt, elapsedMs);
    } else {
        await dailyRepo.markFailed(date, token, finishedAt, elapsedMs);
    }
    await dailyRepo.setAttemptBoard(date, token, board);

    io.to(socketId).emit(SERVER_EVENTS.DAILY_BOARD_UPDATE, { board: projectBoard(board, { revealMines: true }) });
    // The re-read above already holds the final move's pace crossings — its
    // caller wrote them before running the win check.
    const milestones = parseMilestones(attempt.milestones);
    io.to(socketId).emit(won ? SERVER_EVENTS.DAILY_WON : SERVER_EVENTS.DAILY_GAME_OVER, { elapsedMs, milestones });

    // Stats record at the FINISH, not at leaderboard submit: the private
    // profile counts the game whether or not the player publishes a score.
    // Fire-and-forget, guests skipped inside.
    try {
        recordForSockets([socketId], {
            mode: 'daily',
            boardKey: boardKeyOf(board),
            won,
            durationMs: elapsedMs,
            players: 1,
            finishedAt,
            // The PUZZLE date, not the finish day: this attempt can be
            // yesterday's daily finished after UTC midnight, and the profile
            // calendar files it under the day it was set.
            dailyDate: date,
        });
    } catch (error) {
        console.error('Stats write dropped:', error.message);
    }
};

/** Win iff every non-mine cell is open. Ends the attempt via finishAttempt when true. */
const checkDailyWin = async (date, token, socketId, board) => {
    const allNonMinesOpened = board.every((row) => row.every((cell) => cell.isMine || cell.isOpen));
    if (!allNonMinesOpened) return false;

    await finishAttempt(date, token, socketId, board, { won: true });
    return true;
};

/*
 * The three move handlers below each read the attempt's board, mutate it and
 * write the whole field back, so none is safe to run concurrently for one
 * attempt. Each holds that attempt's action lock and reads inside it — the token
 * lives in localStorage and is shared across tabs, and two fast clicks are
 * enough on their own.
 */
const openCell = async (date, token, socketId, row, col) =>
    dailyRepo.withAttemptLock(date, token, socketId, async () => {
        const attempt = await dailyRepo.getAttempt(date, token);
        if (!attempt || !attempt.status || TERMINAL_STATUSES.includes(attempt.status)) return;

        const board = JSON.parse(attempt.board);
        if (!board || row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
        if (board[row][col] === undefined || !board[row][col] || board[row][col].isOpen || board[row][col].isFlagged) return;

        const startedAt = await markStartedIfNeeded(date, token, attempt);

        const toUpdate = [];
        const { hitMine } = revealFrom(board, row, col, toUpdate);

        if (hitMine) {
            // No pace to record: a mine reveal opens no safe cells.
            await finishAttempt(date, token, socketId, board, { won: false });
            return;
        }

        await recordPaceIfCrossed(date, token, attempt, board, startedAt);
        await dailyRepo.setAttemptBoard(date, token, board);

        const won = await checkDailyWin(date, token, socketId, board);
        if (!won) {
            io.to(socketId).emit(SERVER_EVENTS.DAILY_UPDATE_CELLS, projectCells(toUpdate));
        }
});

const chordCell = async (date, token, socketId, row, col) =>
    dailyRepo.withAttemptLock(date, token, socketId, async () => {
        const attempt = await dailyRepo.getAttempt(date, token);
        if (!attempt || !attempt.status || TERMINAL_STATUSES.includes(attempt.status)) return;

        const board = JSON.parse(attempt.board);
        if (!board || row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
        if (!board[row][col] || !board[row][col].isOpen) return;

        const startedAt = await markStartedIfNeeded(date, token, attempt);

        const adjacentCells = getAdjacentCells(row, col, board);
        const flaggedCells = adjacentCells.filter((adj) => adj.isFlagged).length;
        const toUpdate = [];
        let hitMine = false;

        if (flaggedCells === board[row][col].nearbyMines) {
            for (const adj of adjacentCells) {
                if (hitMine || adj.isFlagged || adj.isOpen) continue;
                const result = revealFrom(board, adj.row, adj.col, toUpdate);
                if (result.hitMine) hitMine = true;
            }
        }

        if (hitMine) {
            // A chord that booms may still have opened safe cells before the
            // mine, but the run is over — the bar ends at the last decile the
            // player SURVIVED crossing, so those part-crossings don't record.
            await finishAttempt(date, token, socketId, board, { won: false });
            return;
        }

        await recordPaceIfCrossed(date, token, attempt, board, startedAt);
        await dailyRepo.setAttemptBoard(date, token, board);

        const won = await checkDailyWin(date, token, socketId, board);
        if (!won) {
            io.to(socketId).emit(SERVER_EVENTS.DAILY_UPDATE_CELLS, projectCells(toUpdate));
        }
});

/** Flagging is not a "real move" for timing purposes -- the clock starts on
 * open/chord only (see markStartedIfNeeded's callers), so this never stamps it. */
const toggleFlag = async (date, token, socketId, row, col) =>
    dailyRepo.withAttemptLock(date, token, socketId, async () => {
        const attempt = await dailyRepo.getAttempt(date, token);
        if (!attempt || !attempt.status || TERMINAL_STATUSES.includes(attempt.status)) return;

        const board = JSON.parse(attempt.board);
        if (!board || row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
        if (board[row][col] === undefined || !board[row][col] || board[row][col].isOpen) return;

        board[row][col].isFlagged = !board[row][col].isFlagged;
        const toUpdate = [{ ...board[row][col], row, col }];

        // Save before telling anyone, as openCell and chordCell do. A flag that
        // only exists on screen is worse than one that never appeared: every
        // later action re-reads the stored board, so the next move silently
        // undoes it and nothing reports a problem.
        await dailyRepo.setAttemptBoard(date, token, board);
        io.to(socketId).emit(SERVER_EVENTS.DAILY_UPDATE_CELLS, projectCells(toUpdate));
});

module.exports = {
    generateDailyBoardForDate,
    DAILY_MAX_ATTEMPTS,
    DAILY_CANDIDATE_POOL_SIZE,
    hardestSolvableCandidate,
    openCell,
    chordCell,
    toggleFlag,
};
