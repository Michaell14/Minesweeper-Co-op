/**
 * Regression: chording into a mine must not also report a win. chordCell and
 * toggleFlag used to pass checkWin the snapshot from entry, which predates
 * the reveal that set gameOver, so a chord that detonated a mine AND opened
 * the last safe cells emitted gameWon on top of gameOver.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const coop = require('../game/coop');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const SOCKET = 'sock-1';
let client;

/**
 * 3x3 with the centre open at 0, so an unflagged chord opens all eight
 * neighbours, one a mine. Every cell is then open or a mine.
 */
const chordIntoMineBoard = () => {
    const board = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
    );
    board[0][0] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    board[1][1] = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 0 };
    return board;
};

const emittedEvents = () => mockEmit.mock.calls.map((c) => c[0]);

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'players') return JSON.stringify([SOCKET]);
        if (field === 'name') return 'Alice';
        if (field === 'score') return '0';
        if (field === 'gameWon') return 'false';
        return null;
    });
    // Room state re-read AFTER the reveal: the mine has already set gameOver.
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:')
            ? { gameOver: 'true', gameWon: 'false', players: JSON.stringify([SOCKET]) }
            : { name: 'Alice', score: '0' }
    );
});

describe('chording into a mine', () => {
    const staleSnapshot = (board) => ({
        gameOver: 'false',   // true at entry, and no longer true by the time checkWin runs
        gameWon: 'false',
        board: JSON.stringify(board),
        numRows: '3',
        numCols: '3',
        numMines: '1',
        players: JSON.stringify([SOCKET]),
    });

    test('ends the game', async () => {
        await coop.chordCell(1, 1, ROOM, SOCKET, staleSnapshot(chordIntoMineBoard()));

        expect(emittedEvents()).toContain('gameOver');
    });

    test('does NOT also announce a win', async () => {
        await coop.chordCell(1, 1, ROOM, SOCKET, staleSnapshot(chordIntoMineBoard()));

        expect(emittedEvents()).not.toContain('gameWon');
    });

    test('does not mark the room as won', async () => {
        await coop.chordCell(1, 1, ROOM, SOCKET, staleSnapshot(chordIntoMineBoard()));

        const wonWrites = client.hSet.mock.calls.filter((c) => c[1] && c[1].gameWon === 'true');
        expect(wonWrites).toEqual([]);
    });
});

describe('toggleFlag reads current state too', () => {
    test('does nothing once the game has ended, even if its snapshot predates that', async () => {
        const board = chordIntoMineBoard();
        await coop.toggleFlag(2, 2, ROOM, SOCKET, {
            gameOver: 'false', // stale
            gameWon: 'false',
            board: JSON.stringify(board),
            numRows: '3',
            numCols: '3',
            players: JSON.stringify([SOCKET]),
        });

        expect(emittedEvents()).not.toContain('gameWon');
    });
});
