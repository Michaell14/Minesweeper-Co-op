/**
 * Board generation — pure, and deliberately kept apart from room state. Nothing
 * here touches Redis, the socket server or the clock.
 *
 * `rng` is injectable, which is what lets the daily challenge draw every
 * candidate from a seeded sequence and makes generation a pure function of its
 * seed.
 */

const { isBoardSolvable } = require('./solverUtils');
const { createEmptyBoard } = require('./board');

/** One random candidate layout, with the 3x3 around the first click kept clear. */
const generateSingleCandidateBoard = (numRows, numCols, numMines, excludeRow, excludeCol, rng = Math.random) => {
    const board = createEmptyBoard(numRows, numCols);

    // Cap mines at the space actually available, or the placement loop never ends.
    const maxMines = numRows * numCols - 9;
    const actualMines = Math.min(numMines, maxMines);

    const validPositions = [];
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            if (!(r >= excludeRow - 1 && r <= excludeRow + 1 && c >= excludeCol - 1 && c <= excludeCol + 1)) {
                validPositions.push({ row: r, col: c });
            }
        }
    }

    // Fisher-Yates, stopping once enough positions have been drawn.
    for (let i = validPositions.length - 1; i >= validPositions.length - actualMines; i--) {
        const j = Math.floor(rng() * (i + 1));
        [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];

        const { row, col } = validPositions[i];
        board[row][col] = {
            ...board[row][col],
            isMine: true
        };
    }

    // Neighbour counts for every non-mine cell.
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            if (!board[r][c].isMine) {
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < numRows && nc >= 0 && nc < numCols && board[nr][nc].isMine) {
                            count++;
                        }
                    }
                }
                board[r][c] = { 
                    ...board[r][c],
                    nearbyMines: count
                };
            }
        }
    }

    return board;
};

/**
 * How many candidate layouts to try before giving up on the no-guess guarantee.
 *
 * Only ~7% of random layouts at Extreme's 20.6% density are logic-solvable, so
 * the old value of 50 fell back to a guessy board 3% of the time on Large and
 * 13% on a 32x16 custom — silently, since the fallback is indistinguishable from
 * a real result. 300 removed the fallback entirely across 200 games on every
 * shipped size, and costs nothing in the common case because the loop stops at
 * the first success (median 5-15 attempts).
 */
const DEFAULT_MAX_ATTEMPTS = 300;

/**
 * Generates a board. With `options.noGuess` (the default), retries candidates
 * until one is 100% solvable by logic alone — no 50:50 guessing.
 *
 * `options.rng` defaults to Math.random; the daily challenge passes a seeded
 * generator so every candidate comes from the same deterministic sequence.
 */
const generateBoard = (numRows, numCols, numMines, excludeRow, excludeCol, options = { noGuess: true, maxAttempts: DEFAULT_MAX_ATTEMPTS }) => {
    const shouldEnsureNoGuess = options && options.noGuess !== false;
    const maxAttempts = (options && options.maxAttempts) || DEFAULT_MAX_ATTEMPTS;
    const rng = (options && options.rng) || Math.random;

    if (!shouldEnsureNoGuess) {
        return generateSingleCandidateBoard(numRows, numCols, numMines, excludeRow, excludeCol, rng);
    }

    let fallbackCandidate = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = generateSingleCandidateBoard(numRows, numCols, numMines, excludeRow, excludeCol, rng);
        if (!fallbackCandidate) {
            fallbackCandidate = candidate;
        }

        if (isBoardSolvable(candidate, excludeRow, excludeCol)) {
            return candidate;
        }
    }

    // Attempts exhausted: hand back a guessy board rather than nothing.
    return fallbackCandidate;
};

module.exports = { generateBoard, generateSingleCandidateBoard, DEFAULT_MAX_ATTEMPTS };
