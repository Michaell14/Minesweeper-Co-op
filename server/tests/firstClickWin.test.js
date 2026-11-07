/**
 * A first click whose cascade opens every safe cell wins inside checkWin,
 * which sends the stopped clock, the revealed board and gameWon. openCell's
 * own first-click emits once followed those, from state read before the win:
 * a running clock (the timer restarted) and a board with the mines hidden.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

/** 4x4, one mine in the far corner: a click at (0,0) opens all 15 safe cells. */
const mockCornerMineBoard = () => {
    const board = Array.from({ length: 4 }, (_, r) =>
        Array.from({ length: 4 }, (_, c) => ({
            isMine: false,
            isOpen: false,
            isFlagged: false,
            nearbyMines: r >= 2 && c >= 2 ? 1 : 0,
        }))
    );
    board[3][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    return board;
};

jest.mock('../domain/boardGen', () => ({
    ...jest.requireActual('../domain/boardGen'),
    generateBoard: jest.fn(() => mockCornerMineBoard()),
}));

const coop = require('../game/coop');
const { redisClient } = require('../utils/initializeRedisClient');
const { createEmptyBoard } = require('../domain/board');
const { encodeBoard } = require('../domain/boardCodec');

const ROOM = 'r1';
const SOCKET = 'sock-1';

const firstClickState = () => ({
    gameOver: 'false',
    gameWon: 'false',
    initialized: 'false',
    noGuess: 'false',
    board: encodeBoard(createEmptyBoard(4, 4)),
    numRows: '4',
    numCols: '4',
    numMines: '1',
    players: JSON.stringify([SOCKET]),
});

/** Every emit, in order, as [event, payload]. */
const emits = () => mockEmit.mock.calls.map(([event, payload]) => [event, payload]);

beforeEach(async () => {
    const client = await redisClient;
    jest.clearAllMocks();
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'score') return '0';
        if (field === 'players') return JSON.stringify([SOCKET]);
        if (field === 'gameWon') return 'false';
        if (field === 'name') return 'Alice';
        if (field === 'initialized') return 'false';
        return null;
    });
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:')
            ? { gameOver: 'false', gameWon: 'false', startedAt: '1000', players: JSON.stringify([SOCKET]) }
            : { name: 'Alice', score: '0' }
    );
    client.hSet.mockResolvedValue(1);
    client.set.mockResolvedValue('OK');
    client.del.mockResolvedValue(1);
});

describe('a first click that clears the whole board', () => {
    test('wins the game', async () => {
        await coop.openCell(0, 0, ROOM, SOCKET, firstClickState(), '0');

        expect(emits().map(([event]) => event)).toContain('gameWon');
    });

    test('never sends a running clock after the win', async () => {
        await coop.openCell(0, 0, ROOM, SOCKET, firstClickState(), '0');

        const events = emits();
        const wonAt = events.findIndex(([event]) => event === 'gameWon');
        const clocks = events.filter(([event]) => event === 'gameClock');
        expect(clocks.length).toBeGreaterThan(0);
        expect(clocks[clocks.length - 1][1].endedAt).not.toBeNull();
        expect(events.slice(wonAt + 1).some(([event, clock]) => event === 'gameClock' && clock.endedAt === null))
            .toBe(false);
    });

    test('still sends the start before the win, so the run is measured from it', async () => {
        await coop.openCell(0, 0, ROOM, SOCKET, firstClickState(), '0');

        const events = emits();
        const start = events.findIndex(([event, clock]) => event === 'gameClock' && clock.endedAt === null);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(start).toBeLessThan(events.findIndex(([event]) => event === 'gameWon'));
        // A live start, not a join snapshot: analytics count it.
        expect(events[start][1].replay).toBeUndefined();
    });

    test('leaves the mines revealed', async () => {
        await coop.openCell(0, 0, ROOM, SOCKET, firstClickState(), '0');

        const boards = emits().filter(([event]) => event === 'boardUpdate');
        const last = boards[boards.length - 1][1];
        expect(last[3][3].isMine).toBe(true);
    });
});

describe('a first click that does not win', () => {
    test('still sends the start clock and the opened board, mines hidden', async () => {
        const { generateBoard } = require('../domain/boardGen');
        generateBoard.mockImplementationOnce(() => {
            const board = mockCornerMineBoard();
            // A second mine nothing opens next to: the cascade cannot finish the board.
            board[0][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
            board[0][2].nearbyMines = 1;
            board[1][2].nearbyMines = 1;
            board[1][3].nearbyMines = 1;
            return board;
        });

        await coop.openCell(0, 0, ROOM, SOCKET, { ...firstClickState(), numMines: '2' }, '0');

        const events = emits();
        expect(events.map(([event]) => event)).not.toContain('gameWon');
        expect(events.some(([event, clock]) => event === 'gameClock' && clock.endedAt === null)).toBe(true);
        const board = events.filter(([event]) => event === 'boardUpdate').pop()[1];
        expect(board.flat().every((cell) => cell.isMine === false)).toBe(true);
    });
});
