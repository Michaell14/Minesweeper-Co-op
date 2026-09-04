/**
 * Board generation, pure: nothing here touches Redis, the socket server or the
 * clock. `rng` is injectable so the daily challenge can seed every candidate.
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
 * Candidates to try before giving up the no-guess guarantee. Only ~7% of
 * layouts at Extreme's density are solvable, so 50 fell back to a guessy board
 * silently (3% on Large, 13% on 32x16). 300 removed the fallback across 200
 * games per size, and the loop stops at the first success (median 5-15).
 */
const DEFAULT_MAX_ATTEMPTS = 300;

/**
 * Generates a board. With `options.noGuess` (the default), retries until a
 * candidate is solvable by logic alone. `options.rng` defaults to Math.random.
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
