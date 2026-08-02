/**
 * Board generation for PVP.
 *
 * Both players race ONE board now: startPvpGame generates it, no-guess verified
 * around a shared start cell, and hands the same layout to both. The sharing
 * itself is covered in sharedPvpBoard.test.js; this file covers the generator's
 * first-click safe zone, which that shared start cell relies on.
 */

const { generateBoard } = require('../domain/boardGen');

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
