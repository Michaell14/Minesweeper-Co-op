/**
 * Characterization tests for server/utils/gameUtils.js
 *
 * These pin the CURRENT behavior of the board factory, the board generator and
 * the co-op win check so that upcoming refactors (splitting boardUtils, moving
 * createEmptyBoard out to break the gameUtils <-> playerUtils require cycle,
 * introducing a Redis repository layer) fail loudly if they change semantics.
 *
 * io and Redis are mocked, so nothing here needs a running server.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockRedisClient = {
    hGet: jest.fn(),
    hSet: jest.fn(),
};

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedisClient),
}));

const { createEmptyBoard, generateBoard, checkWin } = require('../utils/gameUtils');

beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.hGet.mockResolvedValue('false');
    mockRedisClient.hSet.mockResolvedValue(1);
});

// ---------------------------------------------------------------------------

const countMines = (board) =>
    board.reduce((total, row) => total + row.filter((cell) => cell.isMine).length, 0);

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

// ---------------------------------------------------------------------------

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

describe('generateBoard', () => {
    // noGuess: false skips the solvability retry loop, so these assertions cover
    // the raw placement behavior without depending on the solver.
    const opts = { noGuess: false };

    test('places exactly numMines mines', () => {
        const board = generateBoard(16, 16, 40, 8, 8, opts);

        expect(countMines(board)).toBe(40);
    });

    test('never places a mine in the 3x3 zone around the first click', () => {
        for (let attempt = 0; attempt < 20; attempt++) {
            const board = generateBoard(12, 12, 30, 6, 6, opts);

            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    expect(board[6 + dr][6 + dc].isMine).toBe(false);
                }
            }
        }
    });

    test('computes nearbyMines correctly for every non-mine cell', () => {
        const board = generateBoard(12, 12, 25, 3, 4, opts);

        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[0].length; c++) {
                if (!board[r][c].isMine) {
                    expect(board[r][c].nearbyMines).toBe(expectedNearbyMines(board, r, c));
                }
            }
        }
    });

    test('caps mines at the number of cells outside the safe zone', () => {
        const board = generateBoard(8, 8, 999, 4, 4, opts);

        expect(countMines(board)).toBe(8 * 8 - 9);
    });

    test('honors the safe zone and mine count with the no-guess loop enabled', () => {
        // Default options run the generate-and-verify retry loop; whichever board
        // it settles on (solvable or fallback) must still satisfy the invariants.
        const board = generateBoard(9, 9, 10, 4, 4);

        expect(countMines(board)).toBe(10);
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                expect(board[4 + dr][4 + dc].isMine).toBe(false);
            }
        }
    });
});

describe('checkWin', () => {
    /** 2x2 board with a single mine at [0][1]; every safe cell is open. */
    const wonBoard = () => [
        [
            { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
            { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 },
        ],
        [
            { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
            { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
        ],
    ];

    test('emits gameWon and persists the board when all non-mine cells are open', async () => {
        const board = wonBoard();

        await checkWin({ gameOver: 'false', gameWon: 'false' }, board, 'testroom');

        expect(mockTo).toHaveBeenCalledWith('testroom');
        expect(mockEmit).toHaveBeenCalledWith('boardUpdate', board);
        expect(mockEmit).toHaveBeenCalledWith('gameWon');
        expect(mockRedisClient.hSet).toHaveBeenCalledWith(
            'room:testroom',
            expect.objectContaining({ gameWon: 'true' })
        );
    });

    test('auto-flags every remaining mine on win', async () => {
        const board = wonBoard();

        await checkWin({ gameOver: 'false', gameWon: 'false' }, board, 'testroom');

        expect(board[0][1].isFlagged).toBe(true);
    });

    test('does nothing while any non-mine cell is still closed', async () => {
        const board = wonBoard();
        board[1][1].isOpen = false;

        await checkWin({ gameOver: 'false', gameWon: 'false' }, board, 'testroom');

        expect(mockEmit).not.toHaveBeenCalled();
        expect(mockRedisClient.hSet).not.toHaveBeenCalled();
    });

    test.each([
        ['gameOver', { gameOver: 'true', gameWon: 'false' }],
        ['gameWon', { gameOver: 'false', gameWon: 'true' }],
    ])('does nothing when the room state already reports %s', async (_label, roomState) => {
        await checkWin(roomState, wonBoard(), 'testroom');

        expect(mockEmit).not.toHaveBeenCalled();
        expect(mockRedisClient.hSet).not.toHaveBeenCalled();
    });

    test('does not emit twice when Redis already recorded the win', async () => {
        mockRedisClient.hGet.mockResolvedValue('true');

        await checkWin({ gameOver: 'false', gameWon: 'false' }, wonBoard(), 'testroom');

        expect(mockEmit).not.toHaveBeenCalled();
        expect(mockRedisClient.hSet).not.toHaveBeenCalled();
    });
});
