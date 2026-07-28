/**
 * Tests for co-op openCell.
 *
 * This is the busiest function on the server — lazy board generation behind a
 * lock, scoring, revealing, win check and two different emit shapes — and until
 * now the only thing exercising it was the browser smoke test, end to end.
 * Mutating its board write left the whole suite green, which is what prompted
 * this file.
 *
 * Boards are hand-built with explicit nearbyMines of 1 so nothing cascades and
 * each assertion is about one behaviour.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const coop = require('../game/coop');
const { redisClient } = require('../utils/initializeRedisClient');
const { createEmptyBoard } = require('../domain/board');

const ROOM = 'r1';
const SOCKET = 'sock-1';

let client;

/** 4x4, all closed, no cascades. Mine at (3,3) unless told otherwise. */
const playedBoard = () => {
    const board = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
    );
    board[3][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    return board;
};

const roomStateWith = (board, extra = {}) => ({
    gameOver: 'false',
    gameWon: 'false',
    initialized: 'true',
    noGuess: 'false',      // skip the solver; board generation is covered elsewhere
    board: JSON.stringify(board),
    numRows: '4',
    numCols: '4',
    numMines: '1',
    players: JSON.stringify([SOCKET]),
    ...extra,
});

const emitted = (event) => {
    const call = [...mockEmit.mock.calls].reverse().find((c) => c[0] === event);
    return call ? call[1] : null;
};

/** The board as last written back to Redis. */
const savedBoard = () => {
    const call = [...client.hSet.mock.calls].reverse().find((c) => c[1] && c[1].board);
    return call ? JSON.parse(call[1].board) : null;
};

const scoreWrites = () => client.hSet.mock.calls.filter((c) => c[0] === `player:${SOCKET}` && c[1].score);

beforeEach(async () => {
    client = await redisClient;
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
            ? { gameOver: 'false', gameWon: 'false', players: JSON.stringify([SOCKET]) }
            : { name: 'Alice', score: '0' }
    );
    client.hSet.mockResolvedValue(1);
    client.set.mockResolvedValue('OK');   // init lock acquired
    client.del.mockResolvedValue(1);
});

describe('the first click on a room', () => {
    const firstClickState = () =>
        roomStateWith(createEmptyBoard(4, 4), { initialized: 'false', numMines: '2' });

    test('generates the board and marks the room initialized', async () => {
        await coop.openCell(1, 1, ROOM, SOCKET, firstClickState(), '0');

        const init = client.hSet.mock.calls.find((c) => c[1] && c[1].initialized);
        expect(init[0]).toBe(`room:${ROOM}`);
        expect(init[1].initialized).toBe('true');
        expect(JSON.parse(init[1].board)).toHaveLength(4);
    });

    test('never puts a mine under the first click', async () => {
        for (let attempt = 0; attempt < 10; attempt++) {
            jest.clearAllMocks();
            client.hSet.mockResolvedValue(1);
            await coop.openCell(2, 2, ROOM, SOCKET, firstClickState(), '0');
            expect(savedBoard()[2][2].isMine).toBe(false);
        }
    });

    test('sends the whole board rather than a cell list', async () => {
        await coop.openCell(1, 1, ROOM, SOCKET, firstClickState(), '0');

        expect(emitted('boardUpdate')).not.toBeNull();
        expect(emitted('updateCells')).toBeNull();
    });

    test('the board it sends carries no mine positions', async () => {
        await coop.openCell(1, 1, ROOM, SOCKET, firstClickState(), '0');

        const board = emitted('boardUpdate');
        expect(board.flat().every((cell) => cell.isMine === false)).toBe(true);
        // ...while Redis keeps the real thing
        expect(savedBoard().flat().filter((cell) => cell.isMine)).toHaveLength(2);
    });

    test('scores every cell the opening cascade revealed, not one for the click', async () => {
        await coop.openCell(1, 1, ROOM, SOCKET, firstClickState(), '0');

        const opened = savedBoard().flat().filter((cell) => cell.isOpen).length;
        expect(opened).toBeGreaterThan(1);            // it really did cascade
        expect(scoreWrites()).toEqual([[`player:${SOCKET}`, { score: String(opened) }]]);
    });

    test('releases the init lock', async () => {
        await coop.openCell(1, 1, ROOM, SOCKET, firstClickState(), '0');

        expect(client.del).toHaveBeenCalledWith(`init_lock:${ROOM}`);
    });
});

describe('a later click on an initialised board', () => {
    test('opens the cell and sends an incremental update', async () => {
        await coop.openCell(0, 0, ROOM, SOCKET, roomStateWith(playedBoard()), '0');

        const updates = emitted('updateCells');
        expect(updates).toHaveLength(1);
        expect(updates[0]).toMatchObject({ row: 0, col: 0, isOpen: true });
        expect(emitted('boardUpdate')).toBeNull();
    });

    test('awards one point for a click that opens exactly one cell', async () => {
        await coop.openCell(0, 0, ROOM, SOCKET, roomStateWith(playedBoard()), '4');

        expect(client.hSet).toHaveBeenCalledWith(`player:${SOCKET}`, { score: '5' });
    });

    test('awards a point per cell when the click cascades', async () => {
        // (0,0) claims 0 adjacent mines, so opening it also opens its neighbours.
        const board = playedBoard();
        board[0][0].nearbyMines = 0;

        await coop.openCell(0, 0, ROOM, SOCKET, roomStateWith(board), '4');

        const opened = savedBoard().flat().filter((cell) => cell.isOpen).length;
        expect(opened).toBe(4);                        // (0,0) plus three neighbours
        expect(client.hSet).toHaveBeenCalledWith(`player:${SOCKET}`, { score: '8' });
    });

    test('persists the opened board', async () => {
        await coop.openCell(0, 0, ROOM, SOCKET, roomStateWith(playedBoard()), '0');

        expect(savedBoard()[0][0].isOpen).toBe(true);
    });

    test('opening a mine ends the game and names the player', async () => {
        await coop.openCell(3, 3, ROOM, SOCKET, roomStateWith(playedBoard()), '0');

        expect(mockEmit).toHaveBeenCalledWith('gameOver', 'Alice');
        expect(client.hSet).toHaveBeenCalledWith(`room:${ROOM}`, expect.objectContaining({ gameOver: 'true', gameOverName: 'Alice' }));
    });

    test('opening a mine pushes a revealed board, or the UI could not draw the mines', async () => {
        await coop.openCell(3, 3, ROOM, SOCKET, roomStateWith(playedBoard()), '0');

        const board = emitted('boardUpdate');
        expect(board.flat().some((cell) => cell.isMine === true)).toBe(true);
    });

    test('opening a mine awards no point', async () => {
        await coop.openCell(3, 3, ROOM, SOCKET, roomStateWith(playedBoard()), '0');

        expect(scoreWrites()).toHaveLength(0);
    });
});

describe('clicks that must do nothing', () => {
    test.each([
        ['the cell is already open', (b) => { b[0][0].isOpen = true; }],
        ['the cell is flagged', (b) => { b[0][0].isFlagged = true; }],
    ])('ignores a click when %s', async (_label, mutate) => {
        const board = playedBoard();
        mutate(board);

        await coop.openCell(0, 0, ROOM, SOCKET, roomStateWith(board), '0');

        expect(mockEmit).not.toHaveBeenCalled();
        expect(scoreWrites()).toHaveLength(0);
    });

    test.each([
        ['the game is over', { gameOver: 'true' }],
        ['the game is won', { gameWon: 'true' }],
    ])('ignores a click once %s', async (_label, extra) => {
        await coop.openCell(0, 0, ROOM, SOCKET, roomStateWith(playedBoard(), extra), '0');

        expect(mockEmit).not.toHaveBeenCalled();
    });

    test.each([
        ['above the board', -1, 0],
        ['below the board', 9, 0],
        ['left of the board', 0, -1],
        ['right of the board', 0, 9],
    ])('ignores coordinates %s', async (_label, row, col) => {
        await coop.openCell(row, col, ROOM, SOCKET, roomStateWith(playedBoard()), '0');

        expect(mockEmit).not.toHaveBeenCalled();
    });
});

describe('when another player is initialising the same room', () => {
    test('waits for their board instead of generating a second one', async () => {
        const theirBoard = playedBoard();
        theirBoard[0][0].isOpen = false;

        client.set.mockResolvedValue(null); // lost the race for the lock
        let polls = 0;
        client.hGet.mockImplementation(async (key, field) => {
            if (field === 'initialized') { polls++; return 'true'; }
            if (field === 'board') return JSON.stringify(theirBoard);
            if (field === 'score') return '0';
            if (field === 'players') return JSON.stringify([SOCKET]);
            if (field === 'gameWon') return 'false';
            if (field === 'name') return 'Alice';
            return null;
        });

        await coop.openCell(0, 0, ROOM, SOCKET, roomStateWith(playedBoard(), { initialized: 'false' }), '0');

        expect(polls).toBeGreaterThan(0);
        // The loser of the race must not generate a board of its own...
        const init = client.hSet.mock.calls.find((c) => c[1] && c[1].initialized);
        expect(init).toBeUndefined();
        // ...but it still scores what its own click opened on the board it loaded.
        expect(scoreWrites()).toEqual([[`player:${SOCKET}`, { score: '1' }]]);
        expect(emitted('updateCells')).not.toBeNull();
    });
});
