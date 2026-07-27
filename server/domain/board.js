/**
 * Board primitives.
 *
 * This module must stay dependency-free (no io, no Redis, no other server
 * modules). It exists to give gameUtils and playerUtils a shared place to get
 * board helpers from without requiring each other — that cycle silently broke
 * resetGame(). See ARCHITECTURE.md §7.
 */

/**
 * Creates a rows x cols grid of closed, unflagged, mine-free cells.
 * Every cell is a distinct object, so mutating one never affects another.
 */
const createEmptyBoard = (numRows, numCols) =>
    Array.from({ length: numRows }, () =>
        Array.from({ length: numCols }, () => ({
            isMine: false,
            isOpen: false,
            isFlagged: false,
            nearbyMines: 0,
        }))
    );

/**
 * Returns the up-to-8 neighbours of (row, col), each shallow-copied with its own
 * row/col attached. Callers rely on the copy: mutating a returned entry does NOT
 * affect the board, which is why chording re-reads through `board[r][c]`.
 */
const getAdjacentCells = (row, col, grid) => {
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1],
    ];

    const adjacentCells = [];

    directions.forEach(([dx, dy]) => {
        const newRow = row + dx;
        const newCol = col + dy;

        // Check boundaries
        if (newRow >= 0 && newRow < grid.length && newCol >= 0 && newCol < grid[0].length) {
            adjacentCells.push({
                ...grid[newRow][newCol], // Include cell properties (e.g., isOpen, isFlagged)
                row: newRow,
                col: newCol,
            });
        }
    });

    return adjacentCells;
};

module.exports = { createEmptyBoard, getAdjacentCells };
