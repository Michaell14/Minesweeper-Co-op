/**
 * Versus Mode Test Suite
 * Covers board generation used by 1v1 PVP mode.
 *
 * Run with: npm test  (from /server, or `npm test` at the repo root)
 *
 * NOTE: generateSeededBoard is currently NOT used by any production code path.
 * PVP generates a separate board per player via generateBoard (see
 * server/game/pvp.js openCell), so the two players do not race the
 * same mine layout. These tests characterize the seeded generator as written;
 * whether it should be wired up is an open product decision.
 */

const { generateSeededBoard, generateBoard } = require('../utils/gameUtils');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const countMines = (board) =>
    board.reduce((total, row) => total + row.filter((cell) => cell.isMine).length, 0);

const mineLayout = (board) => board.map((row) => row.map((cell) => cell.isMine));

/** Recomputes nearbyMines independently of the implementation under test. */
const expectedNearbyMines = (board, r, c) => {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < board.length && nc >= 0 && nc < board[0].length && board[nr][nc].isMine) {
                count++;
            }
        }
    }
    return count;
};

/** Collects the 3x3 block around (row, col), clipped to the board. */
const safeZoneCells = (board, row, col) => {
    const cells = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r >= 0 && r < board.length && c >= 0 && c < board[0].length) {
                cells.push(board[r][c]);
            }
        }
    }
    return cells;
};

// ---------------------------------------------------------------------------

describe('generateSeededBoard', () => {
    test('same seed produces an identical board', () => {
        const a = generateSeededBoard(16, 16, 40, 12345);
        const b = generateSeededBoard(16, 16, 40, 12345);

        expect(mineLayout(a)).toEqual(mineLayout(b));
        expect(a).toEqual(b);
    });

    test('same seed is stable across repeated generations', () => {
        const first = generateSeededBoard(16, 16, 40, 777777);
        for (let i = 0; i < 4; i++) {
            expect(mineLayout(generateSeededBoard(16, 16, 40, 777777))).toEqual(mineLayout(first));
        }
    });

    test('different seeds produce different mine placements', () => {
        const a = generateSeededBoard(16, 16, 40, 11111);
        const b = generateSeededBoard(16, 16, 40, 22222);

        expect(mineLayout(a)).not.toEqual(mineLayout(b));
    });

    test.each([
        { rows: 8, cols: 8, mines: 10, seed: 101 },
        { rows: 16, cols: 16, mines: 40, seed: 202 },
        { rows: 32, cols: 16, mines: 99, seed: 303 },
    ])('produces a $rows x $cols board with $mines mines', ({ rows, cols, mines, seed }) => {
        const board = generateSeededBoard(rows, cols, mines, seed);

        expect(board).toHaveLength(rows);
        expect(board[0]).toHaveLength(cols);
        expect(countMines(board)).toBe(mines);
    });

    test('nearbyMines is correct for every non-mine cell', () => {
        const board = generateSeededBoard(10, 10, 15, 54321);

        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[0].length; c++) {
                if (!board[r][c].isMine) {
                    expect(board[r][c].nearbyMines).toBe(expectedNearbyMines(board, r, c));
                }
            }
        }
    });

    test('cells start closed and unflagged', () => {
        const board = generateSeededBoard(16, 16, 40, 99999);

        for (const row of board) {
            for (const cell of row) {
                expect(cell.isOpen).toBe(false);
                expect(cell.isFlagged).toBe(false);
                expect(typeof cell.isMine).toBe('boolean');
                expect(typeof cell.nearbyMines).toBe('number');
            }
        }
    });

    test('caps mine count at totalCells - 9 when more mines are requested than fit', () => {
        const rows = 8;
        const cols = 8;
        const board = generateSeededBoard(rows, cols, 100, 12345);

        expect(countMines(board)).toBe(rows * cols - 9);
    });
});

describe('generateBoard first-click safe zone', () => {
    test('keeps the 3x3 zone around the first click clear', () => {
        const board = generateBoard(16, 16, 40, 8, 8);

        expect(safeZoneCells(board, 8, 8).every((cell) => !cell.isMine)).toBe(true);
        expect(countMines(board)).toBe(40);
    });

    test.each([
        [0, 0],
        [0, 15],
        [15, 0],
        [15, 15],
    ])('keeps the clipped safe zone clear for a corner click at [%i,%i]', (row, col) => {
        const board = generateBoard(16, 16, 40, row, col);

        expect(safeZoneCells(board, row, col).every((cell) => !cell.isMine)).toBe(true);
    });

    test('independent calls produce different boards', () => {
        const a = generateBoard(16, 16, 40, 5, 5);
        const b = generateBoard(16, 16, 40, 10, 10);

        expect(mineLayout(a)).not.toEqual(mineLayout(b));
    });
});

describe('PVP progress math', () => {
    // Mirrors the formulas in server/controllers/pvpController.js (totalSafeCells)
    // and components/Grid.tsx (progress percentage). Kept here so a change to
    // either formula has a visible counterpart in the suite.
    test('totalSafeCells excludes mines and percentage is rounded', () => {
        const numRows = 10;
        const numCols = 10;
        const numMines = 10;
        const totalSafeCells = numRows * numCols - numMines;

        expect(totalSafeCells).toBe(90);
        expect(Math.round((45 / totalSafeCells) * 100)).toBe(50);
    });
});
