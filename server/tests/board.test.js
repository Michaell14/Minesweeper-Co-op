/**
 * Tests for server/domain/board.js — the dependency-free board primitives.
 *
 * createEmptyBoard exists here (rather than in gameUtils) to keep gameUtils and
 * playerUtils from requiring each other; getAdjacentCells moved here when the
 * co-op and PVP cell logic were split, since both modes chord through it.
 */

const { createEmptyBoard, getAdjacentCells, revealFrom } = require('../domain/board');

/**
 * Builds a board from an ASCII grid and fills in nearbyMines.
 *   '*' mine   'F' flagged   'o' already open   '.' plain closed cell
 */
const boardFrom = (rows) => {
    const board = rows.map((line) =>
        [...line].map((ch) => ({
            isMine: ch === '*',
            isOpen: ch === 'o',
            isFlagged: ch === 'F',
            nearbyMines: 0,
        }))
    );

    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
            if (board[r][c].isMine) continue;
            let count = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length && board[nr][nc].isMine) count++;
                }
            }
            board[r][c].nearbyMines = count;
        }
    }

    return board;
};

const openCount = (board) => board.flat().filter((cell) => cell.isOpen).length;

describe('createEmptyBoard', () => {
    test('builds a rows x cols grid of closed, unflagged, mine-free cells', () => {
        const board = createEmptyBoard(4, 6);

        expect(board).toHaveLength(4);
        expect(board.every((row) => row.length === 6)).toBe(true);

        for (const row of board) {
            for (const cell of row) {
                expect(cell).toEqual({
                    isMine: false,
                    isOpen: false,
                    isFlagged: false,
                    nearbyMines: 0,
                });
            }
        }
    });

    test('every cell is a distinct object (no shared references)', () => {
        // Guards against a "clever" rewrite using Array.fill(), which would make
        // opening one cell open several.
        const board = createEmptyBoard(3, 3);
        board[0][0].isOpen = true;

        expect(board[0][1].isOpen).toBe(false);
        expect(board[1][0].isOpen).toBe(false);
        expect(board[2][2].isOpen).toBe(false);
    });
});

describe('getAdjacentCells', () => {
    const coordsOf = (cells) => cells.map(({ row, col }) => `${row},${col}`).sort();

    test('returns all 8 neighbours of an interior cell', () => {
        const board = createEmptyBoard(3, 3);

        const neighbours = getAdjacentCells(1, 1, board);

        expect(neighbours).toHaveLength(8);
        expect(coordsOf(neighbours)).toEqual(
            ['0,0', '0,1', '0,2', '1,0', '1,2', '2,0', '2,1', '2,2'].sort()
        );
    });

    test('never includes the cell itself', () => {
        const board = createEmptyBoard(3, 3);

        expect(coordsOf(getAdjacentCells(1, 1, board))).not.toContain('1,1');
    });

    test('clips at corners and edges', () => {
        const board = createEmptyBoard(4, 4);

        expect(getAdjacentCells(0, 0, board)).toHaveLength(3);
        expect(getAdjacentCells(0, 3, board)).toHaveLength(3);
        expect(getAdjacentCells(3, 0, board)).toHaveLength(3);
        expect(getAdjacentCells(3, 3, board)).toHaveLength(3);
        expect(getAdjacentCells(0, 1, board)).toHaveLength(5); // top edge
        expect(getAdjacentCells(2, 0, board)).toHaveLength(5); // left edge
    });

    test('carries the cell state through alongside the coordinates', () => {
        const board = createEmptyBoard(3, 3);
        board[0][0].isFlagged = true;
        board[0][1].isMine = true;
        board[0][1].nearbyMines = 4;

        const neighbours = getAdjacentCells(1, 1, board);
        const flagged = neighbours.find((c) => c.row === 0 && c.col === 0);
        const mine = neighbours.find((c) => c.row === 0 && c.col === 1);

        expect(flagged.isFlagged).toBe(true);
        expect(mine.isMine).toBe(true);
        expect(mine.nearbyMines).toBe(4);
    });

    test('returns copies, so mutating a neighbour does not touch the board', () => {
        // Chording depends on this: it reads flags from these copies but writes
        // through board[r][c], so a shared reference would corrupt the board.
        const board = createEmptyBoard(3, 3);

        const neighbours = getAdjacentCells(1, 1, board);
        neighbours[0].isOpen = true;

        expect(board[0][0].isOpen).toBe(false);
    });

    test('handles a non-square board', () => {
        const board = createEmptyBoard(2, 5);

        expect(getAdjacentCells(0, 4, board)).toHaveLength(3);
        expect(getAdjacentCells(1, 2, board)).toHaveLength(5);
    });
});

describe('revealFrom', () => {
    test('opens a single numbered cell without cascading', () => {
        // (1,1) sits next to the mine, so it has a number and must not spread.
        const board = boardFrom([
            '*..',
            '...',
            '...',
        ]);
        const toUpdate = [];

        const result = revealFrom(board, 1, 1, toUpdate);

        expect(result).toEqual({ hitMine: false, cellsRevealed: 1 });
        expect(toUpdate).toHaveLength(1);
        expect(openCount(board)).toBe(1);
        expect(board[1][1]).toMatchObject({ isOpen: true, nearbyMines: 1 });
    });

    test('cascades through zero cells and stops at numbered ones', () => {
        // One mine in the corner: every other cell is reachable from (4,4).
        const board = boardFrom([
            '*....',
            '.....',
            '.....',
            '.....',
            '.....',
        ]);
        const toUpdate = [];

        const result = revealFrom(board, 4, 4, toUpdate);

        expect(result).toEqual({ hitMine: false, cellsRevealed: 24 });
        expect(openCount(board)).toBe(24);
        expect(board[0][0].isOpen).toBe(false); // the mine is never opened
        expect(toUpdate).toHaveLength(24);
    });

    test('never spreads through a flagged cell', () => {
        const board = boardFrom([
            '...',
            '.F.',
            '...',
        ]);
        const toUpdate = [];

        const result = revealFrom(board, 0, 0, toUpdate);

        expect(result).toEqual({ hitMine: false, cellsRevealed: 8 });
        expect(board[1][1].isOpen).toBe(false);
    });

    test('reports a mine, opens it, and abandons the rest of the traversal', () => {
        const board = boardFrom([
            '*..',
            '...',
            '...',
        ]);
        const toUpdate = [];

        const result = revealFrom(board, 0, 0, toUpdate);

        expect(result).toEqual({ hitMine: true, cellsRevealed: 0 });
        expect(board[0][0].isOpen).toBe(true); // the mine itself is revealed
        expect(toUpdate).toEqual([expect.objectContaining({ row: 0, col: 0, isMine: true })]);
        expect(openCount(board)).toBe(1); // nothing else was touched
    });

    test.each([
        ['an already-open cell', 'o', 1],
        ['a flagged cell', 'F', 0],
    ])('does nothing when started on %s', (_label, ch, alreadyOpen) => {
        const board = boardFrom(['...', `.${ch}.`, '...']);
        const toUpdate = [];

        const result = revealFrom(board, 1, 1, toUpdate);

        expect(result).toEqual({ hitMine: false, cellsRevealed: 0 });
        expect(toUpdate).toHaveLength(0);
        expect(openCount(board)).toBe(alreadyOpen);
    });

    test('ignores an out-of-bounds start without throwing', () => {
        const board = boardFrom(['...', '...', '...']);
        const toUpdate = [];

        expect(revealFrom(board, -1, 0, toUpdate)).toEqual({ hitMine: false, cellsRevealed: 0 });
        expect(revealFrom(board, 0, 99, toUpdate)).toEqual({ hitMine: false, cellsRevealed: 0 });
        expect(toUpdate).toHaveLength(0);
    });

    test('emits each opened cell exactly once, with coordinates and state', () => {
        const board = boardFrom([
            '*....',
            '.....',
            '.....',
        ]);
        const toUpdate = [];

        revealFrom(board, 2, 4, toUpdate);

        const keys = toUpdate.map(({ row, col }) => `${row},${col}`);
        expect(new Set(keys).size).toBe(keys.length); // no duplicates
        for (const entry of toUpdate) {
            expect(entry).toMatchObject({ isOpen: true });
            expect(typeof entry.nearbyMines).toBe('number');
            expect(board[entry.row][entry.col].isOpen).toBe(true);
        }
    });

    test('a cascade can never reach a mine, so only a direct click loses', () => {
        // Cells that cascade have nearbyMines === 0, meaning no adjacent mines --
        // so the flood fill can only ever push safe neighbours.
        const board = boardFrom([
            '*.*',
            '...',
            '*.*',
        ]);
        const toUpdate = [];

        const result = revealFrom(board, 1, 1, toUpdate);

        expect(result.hitMine).toBe(false);
        expect(board.flat().filter((c) => c.isMine && c.isOpen)).toHaveLength(0);
    });
});
