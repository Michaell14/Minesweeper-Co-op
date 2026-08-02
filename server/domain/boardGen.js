/**
 * Board generation — pure, and deliberately kept apart from room state.
 *
 * This used to live in `utils/gameUtils.js` alongside `checkWin`, `createRoom`
 * and `resetGame`, which read and write Redis and emit. Six of that module's
 * ten importers wanted only the generator, so `pvpController` and `game/daily`
 * were transitively pulling in `io`, the repos and `playerUtils` to build an
 * array of cells.
 *
 * Nothing here touches Redis, the socket server or the clock. `rng` is
 * injectable, which is what lets the daily challenge draw every candidate from
 * a seeded sequence and makes the whole function a pure function of its seed.
 */

const { isBoardSolvable } = require('./solverUtils');
const { createEmptyBoard } = require('./board');

// Generates a single random candidate board layout. `rng` defaults to
// Math.random so every existing caller (5 args) is untouched; the daily
// challenge is the only caller that passes a seeded generator, via `options.rng`
// on generateBoard below.
const generateSingleCandidateBoard = (numRows, numCols, numMines, excludeRow, excludeCol, rng = Math.random) => {
    const board = createEmptyBoard(numRows, numCols);

    // Calculate available cells (excluding the 3x3 area around first click)
    const totalCells = numRows * numCols;
    const excludedCells = 9; // 3x3 grid around first click
    const maxMines = totalCells - excludedCells;

    // Prevent infinite loop by capping mines at available space
    const actualMines = Math.min(numMines, maxMines);

    // Create array of all valid positions
    const validPositions = [];
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            // Exclude 3x3 area around first click
            if (!(r >= excludeRow - 1 && r <= excludeRow + 1 && c >= excludeCol - 1 && c <= excludeCol + 1)) {
                validPositions.push({ row: r, col: c });
            }
        }
    }

    // Shuffle array using Fisher-Yates algorithm and place mines
    for (let i = validPositions.length - 1; i >= validPositions.length - actualMines; i--) {
        const j = Math.floor(rng() * (i + 1));
        [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];

        const { row, col } = validPositions[i];
        board[row][col] = {
            ...board[row][col],
            isMine: true
        };
    }

    // For each cell, calculating the number of mines in its 3x3 perimeter
    // Runtime: O(n^2)
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
 * This was 50, which was enough while the densest board shipped was 18.8%.
 * Adding the Extreme difficulty (20.6%, classic Expert) made it too few: only
 * about 7% of random 20x16 layouts at that density are logic-solvable, so 50
 * attempts fell back to a guessy board 3% of the time on Large and 13% on a
 * 32x16 custom board — silently, since the fallback is indistinguishable from a
 * real result.
 *
 * 300 removed the fallback entirely across 200 games on every shipped size. It
 * costs nothing in the common case because the loop stops at the first success
 * (median 5-15 attempts); it only raises the worst case, from ~28ms to ~64ms on
 * the largest board, and that worst case is now vanishingly rare.
 */
const DEFAULT_MAX_ATTEMPTS = 300;

/**
 * Utility function to generate a Minesweeper board.
 * If options.noGuess is true (default), runs a Generate-and-Verify loop with isBoardSolvable
 * to guarantee that the board can be 100% solved without probabilistic 50:50 guessing.
 * options.rng defaults to Math.random; the daily challenge passes a seeded
 * generator (server/game/daily.js) so every candidate in the retry loop below
 * is drawn from the same deterministic sequence, making the whole function's
 * output a pure function of the seed.
 */
const generateBoard = (numRows, numCols, numMines, excludeRow, excludeCol, options = { noGuess: true, maxAttempts: DEFAULT_MAX_ATTEMPTS }) => {
    const shouldEnsureNoGuess = options && options.noGuess !== false;
    const maxAttempts = (options && options.maxAttempts) || DEFAULT_MAX_ATTEMPTS;
    const rng = (options && options.rng) || Math.random;

    if (!shouldEnsureNoGuess) {
        return generateSingleCandidateBoard(numRows, numCols, numMines, excludeRow, excludeCol, rng);
    }

    let fallbackCandidate = null;

    // Retry loop: evaluate candidate layouts until a 100% logic-solvable board is found
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = generateSingleCandidateBoard(numRows, numCols, numMines, excludeRow, excludeCol, rng);
        if (!fallbackCandidate) {
            fallbackCandidate = candidate;
        }

        // Test if candidate board is 100% solvable without guesses starting from (excludeRow, excludeCol)
        if (isBoardSolvable(candidate, excludeRow, excludeCol)) {
            return candidate;
        }
    }

    // Fallback to initial candidate if max attempts reached
    return fallbackCandidate;
};

module.exports = { generateBoard, generateSingleCandidateBoard, DEFAULT_MAX_ATTEMPTS };
