/**
 * Minesweeper Solvability Engine
 * Evaluates whether a candidate board can be 100% solved using logical deduction
 * starting from a given initial click position, without making probabilistic guesses.
 */

/**
 * Helper to get adjacent valid coordinates for a cell
 */
const getAdjacentCoords = (r, c, numRows, numCols) => {
    const coords = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < numRows && nc >= 0 && nc < numCols) {
                coords.push({ r: nr, c: nc });
            }
        }
    }
    return coords;
};

/**
 * Flood-fills open cells starting from a 0-nearbyMines cell
 */
const floodFillZero = (r, c, solverBoard, numRows, numCols) => {
    const stack = [[r, c]];
    while (stack.length > 0) {
        const [currR, currC] = stack.pop();
        const neighbors = getAdjacentCoords(currR, currC, numRows, numCols);
        for (const { r: nr, c: nc } of neighbors) {
            const cell = solverBoard[nr][nc];
            if (!cell.isOpen && !cell.isFlagged && !cell.isMine) {
                cell.isOpen = true;
                if (cell.nearbyMines === 0) {
                    stack.push([nr, nc]);
                }
            }
        }
    }
};

/**
 * Same solve as isBoardSolvable, but also reports HOW it was solved: how many
 * times each rule fired. Rule 1 (single-cell logic) is the deduction anyone
 * scanning a board does at a glance; Rule 2 (subset/overlap reduction) is the
 * "compare two overlapping numbers" reasoning that makes a board feel hard.
 * A board solvable using Rule 1 alone is logic-solvable but trivial -- this is
 * what lets the daily challenge (server/game/daily.js) pick a genuinely hard
 * layout instead of just the first one that avoids a 50/50 guess.
 *
 * @param {Array<Array<Object>>} board - 2D grid of cells ({ isMine, nearbyMines })
 * @param {number} startRow - Row of initial click
 * @param {number} startCol - Col of initial click
 * @returns {{ solvable: boolean, rule1Count: number, rule2Count: number }}
 */
const solveWithStats = (board, startRow, startCol) => {
    const numRows = board.length;
    const numCols = board[0].length;

    let rule1Count = 0;
    let rule2Count = 0;

    // Create lightweight simulation board state
    let totalNonMines = 0;
    const solverBoard = Array.from({ length: numRows }, (_, r) =>
        Array.from({ length: numCols }, (_, c) => {
            const isMine = board[r][c].isMine;
            if (!isMine) totalNonMines++;
            return {
                isMine,
                nearbyMines: board[r][c].nearbyMines,
                isOpen: false,
                isFlagged: false,
            };
        })
    );

    // Initial click simulation
    const startCell = solverBoard[startRow][startCol];
    if (startCell.isMine) return { solvable: false, rule1Count: 0, rule2Count: 0 };
    startCell.isOpen = true;
    if (startCell.nearbyMines === 0) {
        floodFillZero(startRow, startCol, solverBoard, numRows, numCols);
    }

    let madeProgress = true;

    // Deductive solver loop
    while (madeProgress) {
        madeProgress = false;

        // -------------------------------------------------------------------------
        // RULE 1: Single-Cell Logic (Direct Flags and Direct Reveals)
        // -------------------------------------------------------------------------
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                const cell = solverBoard[r][c];
                if (!cell.isOpen || cell.nearbyMines === 0) continue;

                const neighbors = getAdjacentCoords(r, c, numRows, numCols);
                const unrevealed = [];
                let flagCount = 0;

                for (const { r: nr, c: nc } of neighbors) {
                    const nCell = solverBoard[nr][nc];
                    if (nCell.isFlagged) {
                        flagCount++;
                    } else if (!nCell.isOpen) {
                        unrevealed.push({ r: nr, c: nc });
                    }
                }

                // Case 1A: All unrevealed neighbors must be mines
                if (unrevealed.length > 0 && unrevealed.length === cell.nearbyMines - flagCount) {
                    for (const { r: nr, c: nc } of unrevealed) {
                        solverBoard[nr][nc].isFlagged = true;
                        madeProgress = true;
                    }
                    rule1Count++;
                }
                // Case 1B: All required mines are flagged -> remaining unrevealed neighbors are safe
                else if (unrevealed.length > 0 && flagCount === cell.nearbyMines) {
                    for (const { r: nr, c: nc } of unrevealed) {
                        const target = solverBoard[nr][nc];
                        target.isOpen = true;
                        madeProgress = true;
                        if (target.nearbyMines === 0) {
                            floodFillZero(nr, nc, solverBoard, numRows, numCols);
                        }
                    }
                    rule1Count++;
                }
            }
        }

        if (madeProgress) continue;

        // -------------------------------------------------------------------------
        // RULE 2: Subset Reduction / Overlapping Neighborhood Logic
        // -------------------------------------------------------------------------
        const openNumberedCells = [];
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                const cell = solverBoard[r][c];
                if (cell.isOpen && cell.nearbyMines > 0) {
                    const neighbors = getAdjacentCoords(r, c, numRows, numCols);
                    const unrevealed = [];
                    let flagCount = 0;
                    for (const { r: nr, c: nc } of neighbors) {
                        if (solverBoard[nr][nc].isFlagged) flagCount++;
                        else if (!solverBoard[nr][nc].isOpen) unrevealed.push(`${nr},${nc}`);
                    }
                    if (unrevealed.length > 0) {
                        openNumberedCells.push({
                            remainingMines: cell.nearbyMines - flagCount,
                            unrevealedSet: new Set(unrevealed),
                            unrevealedArr: unrevealed.map(s => {
                                const [row, col] = s.split(',').map(Number);
                                return { r: row, c: col };
                            })
                        });
                    }
                }
            }
        }

        // Compare pairs of overlapping open cells
        for (let i = 0; i < openNumberedCells.length; i++) {
            for (let j = 0; j < openNumberedCells.length; j++) {
                if (i === j) continue;
                const cellA = openNumberedCells[i];
                const cellB = openNumberedCells[j];

                // Check if unrevealed(A) is a strict subset of unrevealed(B)
                if (cellA.unrevealedSet.size < cellB.unrevealedSet.size) {
                    let isSubset = true;
                    for (const key of cellA.unrevealedSet) {
                        if (!cellB.unrevealedSet.has(key)) {
                            isSubset = false;
                            break;
                        }
                    }

                    if (isSubset) {
                        const diffMines = cellB.remainingMines - cellA.remainingMines;
                        const diffCells = cellB.unrevealedArr.filter(
                            pos => !cellA.unrevealedSet.has(`${pos.r},${pos.c}`)
                        );

                        // Case 2A: No extra mines in diff -> all diff cells are safe
                        if (diffMines === 0 && diffCells.length > 0) {
                            // Tracked locally, not via the shared `madeProgress`: an
                            // earlier pair in this same scan may have already set
                            // that true, which would otherwise credit THIS pair with
                            // a step it did not actually contribute.
                            let pairMadeProgress = false;
                            for (const { r: nr, c: nc } of diffCells) {
                                const target = solverBoard[nr][nc];
                                if (!target.isOpen && !target.isFlagged) {
                                    target.isOpen = true;
                                    madeProgress = true;
                                    pairMadeProgress = true;
                                    if (target.nearbyMines === 0) {
                                        floodFillZero(nr, nc, solverBoard, numRows, numCols);
                                    }
                                }
                            }
                            if (pairMadeProgress) rule2Count++;
                        }
                        // Case 2B: All diff cells must be mines
                        else if (diffMines === diffCells.length && diffCells.length > 0) {
                            let pairMadeProgress = false;
                            for (const { r: nr, c: nc } of diffCells) {
                                const target = solverBoard[nr][nc];
                                if (!target.isFlagged && !target.isOpen) {
                                    target.isFlagged = true;
                                    madeProgress = true;
                                    pairMadeProgress = true;
                                }
                            }
                            if (pairMadeProgress) rule2Count++;
                        }
                    }
                }
            }
            if (madeProgress) break;
        }
    }

    // Evaluate total revealed safe non-mine cells
    let openNonMineCount = 0;
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            if (solverBoard[r][c].isOpen && !solverBoard[r][c].isMine) {
                openNonMineCount++;
            }
        }
    }

    return { solvable: openNonMineCount === totalNonMines, rule1Count, rule2Count };
};

/**
 * Evaluates whether a board layout is 100% solvable without guessing from (startRow, startCol).
 * @param {Array<Array<Object>>} board - 2D grid of cells ({ isMine, nearbyMines })
 * @param {number} startRow - Row of initial click
 * @param {number} startCol - Col of initial click
 * @returns {boolean} - Returns true if board is 100% logic-solvable without guesses
 */
const isBoardSolvable = (board, startRow, startCol) => solveWithStats(board, startRow, startCol).solvable;

module.exports = { isBoardSolvable, solveWithStats };
