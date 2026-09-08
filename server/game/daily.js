/**
 * Daily challenge: one seeded board, identical for every player, ranked by
 * server-authoritative completion time. NOT a room — see data/keys.js.
 * Generation mirrors pvpController's buildSharedBoard but from a date-derived
 * seed, once per day.
 */

const { generateSingleCandidateBoard } = require('../domain/boardGen');
const { solveWithStats } = require('../domain/solverUtils');
const { revealFrom, getAdjacentCells, projectBoard, projectCells } = require('../domain/board');
const { withCrossedMilestones } = require('../../shared/pace');
const { parseMilestones } = require('../domain/pace');
const { hashStringToSeed, mulberry32 } = require('../domain/seededRandom');
const { io } = require('../utils/initializeClient');
const { recordForSockets } = require('../utils/statsRecorder');
const dailyRepo = require('../data/dailyRepo');
const { TERMINAL_STATUSES } = dailyRepo;
const { SERVER_EVENTS } = require('../../shared/events');
const { DAILY_PRESET } = require('../../shared/boardConfig');

/** Safety net on the raw candidate count for an unlucky seed; ~10x what the pool needs. */
const DAILY_MAX_ATTEMPTS = 5000;

/**
 * Solvable candidates sampled before keeping the hardest (most subset/overlap
 * reasoning, see solveWithStats). Turns "solvable" into "hard" without
 * changing what solvable means.
 */
const DAILY_CANDIDATE_POOL_SIZE = 30;

const dailySeedString = (date) => `minesweeper-daily:${date}`;

/**
 * Draws candidates until the pool is full (or attempts run out) and returns
 * the one needing the most Rule 2 steps. Ties keep the first, so the result is
 * a pure function of the seed. Null if none was solvable.
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
 * Builds the day's board: deterministic from `date`, no-guess verified,
 * opened at a fixed center cell. Regular rooms accept the FIRST solvable
 * candidate; this keeps the hardest of a pool. A failing seed would fail
 * forever, so fallback seeds are tried in order and then it throws rather than
 * hand out an unverified board.
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
 * Stamps the clock's start on the first real move (open or chord), not at
 * attempt creation. Idempotent: once `in_progress` the ORIGINAL startedAt is
 * what a refresh resumes from. Returns the effective startedAt either way.
 */
const markStartedIfNeeded = async (date, token, attempt) => {
    if (attempt.status === 'ready') {
        const startedAt = Date.now();
        await dailyRepo.markStarted(date, token, startedAt);
        return startedAt;
    }
    const startedAt = parseInt(attempt.startedAt, 10);
    // A blank stamp shouldn't coexist with in_progress, but NaN would poison every milestone.
    return Number.isFinite(startedAt) ? startedAt : Date.now();
};

/**
 * The pace deciles this move crossed (shared/pace.js), or null. Pure: the
 * caller hands it to setAttemptBoard so milestones land in the SAME write as
 * the board, never as durable stamps from a move that failed.
 */
const newlyCrossedPace = (attempt, board, startedAt) => {
    const before = parseMilestones(attempt.milestones);
    const milestones = withCrossedMilestones(before, board, Date.now() - startedAt);
    return milestones.length > before.length ? milestones : null;
};

/**
 * Ends today's attempt, win or loss: elapsedMs from two server timestamps
 * (never client-supplied), full board revealed, this socket notified. The
 * leaderboard waits for submitScore, once the player has supplied a name.
 */
const finishAttempt = async (date, token, socketId, board, { won }) => {
    const attempt = await dailyRepo.getAttempt(date, token);
    // Re-check rather than trust the caller's read: two tabs can both pass the
    // move handlers' terminal check, and only the first here may emit.
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
    // The re-read already holds the final move's pace crossings.
    const milestones = parseMilestones(attempt.milestones);
    io.to(socketId).emit(won ? SERVER_EVENTS.DAILY_WON : SERVER_EVENTS.DAILY_GAME_OVER, { elapsedMs, milestones });

    // Recorded at the FINISH, not at leaderboard submit: the profile counts the
    // game whether or not a score is published. Fire-and-forget, guests skipped.
    try {
        recordForSockets([socketId], {
            mode: 'daily',
            board,
            won,
            durationMs: elapsedMs,
            players: 1,
            finishedAt,
            // The PUZZLE date, not the finish day: yesterday's daily finished
            // after UTC midnight files under the day it was set.
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
 * The three move handlers each read, mutate and write the whole board back,
 * so each holds the attempt's action lock and reads inside it — the token is
 * shared across tabs.
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

        // Before the win check: finishAttempt re-reads, and needs this move's crossings.
        await dailyRepo.setAttemptBoard(date, token, board, newlyCrossedPace(attempt, board, startedAt));

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
            // Safe cells opened before the boom don't record: the bar ends at
            // the last decile the player SURVIVED crossing.
            await finishAttempt(date, token, socketId, board, { won: false });
            return;
        }

        await dailyRepo.setAttemptBoard(date, token, board, newlyCrossedPace(attempt, board, startedAt));

        const won = await checkDailyWin(date, token, socketId, board);
        if (!won) {
            io.to(socketId).emit(SERVER_EVENTS.DAILY_UPDATE_CELLS, projectCells(toUpdate));
        }
});

/** Flagging is not a real move for timing: the clock starts on open/chord only. */
const toggleFlag = async (date, token, socketId, row, col) =>
    dailyRepo.withAttemptLock(date, token, socketId, async () => {
        const attempt = await dailyRepo.getAttempt(date, token);
        if (!attempt || !attempt.status || TERMINAL_STATUSES.includes(attempt.status)) return;

        const board = JSON.parse(attempt.board);
        if (!board || row < 0 || row >= board.length || col < 0 || col >= board[0].length) return;
        if (board[row][col] === undefined || !board[row][col] || board[row][col].isOpen) return;

        board[row][col].isFlagged = !board[row][col].isFlagged;
        const toUpdate = [{ ...board[row][col], row, col }];

        // Save before telling anyone: every later action re-reads the stored
        // board, so an unsaved flag is silently undone by the next move.
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
