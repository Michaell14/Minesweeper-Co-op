/**
 * Board primitives. Must stay dependency-free (no io, no Redis, no other server
 * modules): this exists so gameUtils and playerUtils share board helpers without
 * requiring each other, a cycle that silently broke resetGame(). See
 * ARCHITECTURE.md §7.
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

        if (newRow >= 0 && newRow < grid.length && newCol >= 0 && newCol < grid[0].length) {
            adjacentCells.push({
                ...grid[newRow][newCol],
                row: newRow,
                col: newCol,
            });
        }
    });

    return adjacentCells;
};

/**
 * Flood-fill reveal, shared by both game modes.
 *
 * Mutates `board` (opening cells) and appends every opened cell to `toUpdate` as
 * `{...cell, row, col}`, ready to emit. Traversal rules:
 *   - out-of-bounds, already-open and flagged cells are skipped
 *   - opening a cell with no adjacent mines cascades to its neighbours
 *   - opening a MINE stops immediately: the mine is opened and pushed, and the
 *     rest of the stack is abandoned
 *
 * Returns `{ hitMine, cellsRevealed }`, where cellsRevealed counts safe cells
 * only. What hitting a mine *means* is the caller's call — the only thing co-op
 * and PVP ever disagreed on: co-op ends the game for the room, PVP for that
 * player alone.
 *
 * Pure — no io, no Redis.
 */
const revealFrom = (board, r, c, toUpdate) => {
    const stack = [[r, c]];
    let cellsRevealed = 0;

    while (stack.length > 0) {
        const [row, col] = stack.pop();

        if (row < 0 || row >= board.length || col < 0 || col >= board[0].length || board[row][col].isOpen || board[row][col].isFlagged) continue;

        board[row][col].isOpen = true;
        toUpdate.push({
            ...board[row][col],
            row: row,
            col: col,
        });

        if (board[row][col].isMine) {
            return { hitMine: true, cellsRevealed };
        }

        cellsRevealed++;

        if (board[row][col].nearbyMines === 0) {
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    stack.push([row + dr, col + dc]);
                }
            }
        }
    }

    return { hitMine: false, cellsRevealed };
};

/**
 * Hides everything a player is not entitled to know about one cell.
 *
 * A closed cell gives away neither `isMine` nor `nearbyMines`: the first is the
 * answer outright, and the second is nearly as good, since it lets you solve the
 * board offline. Both report the neutral 0/false a closed cell renders as
 * anyway. Open cells tell the truth, and `isFlagged` is public by design — flags
 * are shared state in co-op.
 */
const projectCell = (cell, revealMines) => {
    const visible = revealMines || cell.isOpen;
    return {
        isMine: visible ? cell.isMine : false,
        isOpen: cell.isOpen,
        isFlagged: cell.isFlagged,
        nearbyMines: visible ? cell.nearbyMines : 0,
    };
};

/**
 * Board as a specific recipient is allowed to see it. Never mutates the input —
 * Redis keeps the full truth.
 *
 * Pass `revealMines: true` only for terminal states (that player lost, or the
 * game was won), where the UI is meant to show every mine.
 */
const projectBoard = (board, { revealMines = false } = {}) =>
    board.map((row) => row.map((cell) => projectCell(cell, revealMines)));

/** Same projection for an incremental `{...cell, row, col}` update list. */
const projectCells = (cells, { revealMines = false } = {}) =>
    cells.map((cell) => ({
        ...projectCell(cell, revealMines),
        row: cell.row,
        col: cell.col,
    }));

module.exports = { createEmptyBoard, getAdjacentCells, revealFrom, projectBoard, projectCells };
