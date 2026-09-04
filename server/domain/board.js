/**
 * Board primitives. Must stay dependency-free: gameUtils and playerUtils share
 * these without requiring each other (ARCHITECTURE.md §7).
 */

/** A rows x cols grid of closed, unflagged, mine-free cells, each a distinct object. */
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
 * The up-to-8 neighbours of (row, col), each shallow-copied with row/col
 * attached. Mutating a returned entry does NOT affect the board.
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
 * Flood-fill reveal, shared by both modes. Mutates `board` and appends every
 * opened cell to `toUpdate` as `{...cell, row, col}`. Skips out-of-bounds,
 * open and flagged cells; a zero cascades; a MINE is opened, pushed, and stops
 * the traversal. Returns `{ hitMine, cellsRevealed }` (safe cells only); what
 * a mine means is the caller's call (co-op ends the room, PVP that player).
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
 * Hides what a player may not know about one cell: a closed cell gives away
 * neither `isMine` nor `nearbyMines` (the second lets you solve the board
 * offline). `isFlagged` is public — flags are shared state in co-op.
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
 * Board as a recipient may see it; never mutates the input. Pass
 * `revealMines: true` only for terminal states.
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
