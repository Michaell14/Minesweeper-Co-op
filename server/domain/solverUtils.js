/**
 * Solvability engine: can a candidate board be cleared by logic alone from a
 * given first click, with no probabilistic guessing?
 */

/** The up-to-8 in-bounds neighbours of a cell. */
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

/** Flood-fills open cells outward from a 0-nearbyMines cell. */
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
 * Same solve as isBoardSolvable, also reporting how often each rule fired.
 * Rule 1 is single-cell logic; Rule 2 is subset/overlap reduction, the
 * reasoning that makes a board feel hard. That is what lets the daily pick a
 * genuinely hard layout rather than the first that avoids a 50/50.
 *
 * @returns {{ solvable: boolean, rule1Count: number, rule2Count: number }}
 */
const solveWithStats = (board, startRow, startCol) => {
    const numRows = board.length;
    const numCols = board[0].length;

    let rule1Count = 0;
    let rule2Count = 0;

    // Lightweight simulation state, so the caller's board is never touched.
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

    const startCell = solverBoard[startRow][startCol];
    if (startCell.isMine) return { solvable: false, rule1Count: 0, rule2Count: 0 };
    startCell.isOpen = true;
    if (startCell.nearbyMines === 0) {
        floodFillZero(startRow, startCol, solverBoard, numRows, numCols);
    }

    let madeProgress = true;

    while (madeProgress) {
        madeProgress = false;

        // --- RULE 1: single-cell logic (direct flags and direct reveals) -----
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

                // 1A: every unrevealed neighbour must be a mine.
                if (unrevealed.length > 0 && unrevealed.length === cell.nearbyMines - flagCount) {
                    for (const { r: nr, c: nc } of unrevealed) {
                        solverBoard[nr][nc].isFlagged = true;
                        madeProgress = true;
                    }
                    rule1Count++;
                }
                // 1B: every mine is already flagged, so the rest are safe.
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

        // --- RULE 2: subset reduction over overlapping neighbourhoods -------
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

        for (let i = 0; i < openNumberedCells.length; i++) {
            for (let j = 0; j < openNumberedCells.length; j++) {
                if (i === j) continue;
                const cellA = openNumberedCells[i];
                const cellB = openNumberedCells[j];

                // Only a strict subset tells you anything about the difference.
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

                        // 2A: no extra mines in the difference, so it is all safe.
                        if (diffMines === 0 && diffCells.length > 0) {
                            // Tracked per pair: the shared `madeProgress` may
                            // already be set by an earlier pair in this scan.
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
                        // 2B: the difference is all mines.
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

    // Solvable iff logic alone opened every non-mine cell.
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

/** Whether the layout is 100% solvable by logic from (startRow, startCol). */
const isBoardSolvable = (board, startRow, startCol) => solveWithStats(board, startRow, startCol).solvable;

module.exports = { isBoardSolvable, solveWithStats };
