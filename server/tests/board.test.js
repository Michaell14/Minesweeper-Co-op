/**
 * Tests for server/domain/board.js — the dependency-free board primitives.
 *
 * createEmptyBoard exists here (rather than in gameUtils) to keep gameUtils and
 * playerUtils from requiring each other; getAdjacentCells moved here when the
 * co-op and PVP cell logic were split, since both modes chord through it.
 */

const { createEmptyBoard, getAdjacentCells } = require('../domain/board');

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
