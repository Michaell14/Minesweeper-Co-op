/**
 * Chording, server half: the smoke test cannot drive it, since a visible chord
 * needs mine positions the client is never told. Boards are hand-built with
 * explicit nearbyMines so nothing cascades.
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
 * 4x4, one mine at (0,0). nearbyMines: 1 everywhere so nothing cascades; the
 * far column and bottom row stay closed so the win path never fires.
 */
const buildBoard = ({ flagMine = true } = {}) => {
    const board = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
    );
    board[0][0] = { isMine: true, isOpen: false, isFlagged: flagMine, nearbyMines: 0 };
    board[1][1].isOpen = true; // the numbered cell we chord
    return board;
};

const roomStateWith = (board, extra = {}) => ({
    gameOver: 'false',
    gameWon: 'false',
    board: JSON.stringify(board),
    numRows: '4',
    numCols: '4',
    numMines: '1',
    players: JSON.stringify([SOCKET]),
    ...extra,
});

/** The cells in the last updateCells emit. */
const lastUpdateCells = () => {
    const call = [...mockEmit.mock.calls].reverse().find((c) => c[0] === 'updateCells');
    return call ? call[1] : null;
};

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'score') return '0';
        if (field === 'players') return JSON.stringify([SOCKET]);
        if (field === 'gameWon') return 'false';
        if (field === 'name') return 'Alice';
        return null;
    });
    client.hGetAll.mockResolvedValue({ name: 'Alice', score: '0' });
    client.hSet.mockResolvedValue(1);
});

describe('chordCell when the flag count matches the number', () => {
    test('opens every unflagged closed neighbour', async () => {
        const board = buildBoard();

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        const updates = lastUpdateCells();
        // 8 neighbours minus the flagged mine
        expect(updates).toHaveLength(7);
        expect(updates.every((cell) => cell.isOpen)).toBe(true);
        expect(updates.some((cell) => cell.row === 0 && cell.col === 0)).toBe(false);
    });

    test('never opens the flagged cell, even though it is a mine', async () => {
        const board = buildBoard();

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        const saved = JSON.parse(client.hSet.mock.calls.find((c) => c[1].board)[1].board);
        expect(saved[0][0].isOpen).toBe(false);
        expect(saved[0][0].isFlagged).toBe(true);
    });

    test('awards one point per safe cell revealed', async () => {
        const board = buildBoard();

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        expect(client.hSet).toHaveBeenCalledWith(`player:${SOCKET}`, { score: '7' });
    });

    test('does not award points for a flagged safe cell it never opened', async () => {
        // Flag a safe neighbour too. Dropping the isFlagged guard still opens
        // the right cells (revealFrom refuses flagged ones) but inflates the score.
        const board = buildBoard();
        board[2][2].isFlagged = true;
        board[1][1].nearbyMines = 2;

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        expect(lastUpdateCells()).toHaveLength(6); // 8 neighbours - 2 flagged
        expect(client.hSet).toHaveBeenCalledWith(`player:${SOCKET}`, { score: '6' });
        const saved = JSON.parse(client.hSet.mock.calls.find((c) => c[1].board)[1].board);
        expect(saved[2][2].isOpen).toBe(false);
    });

    test('persists the opened board', async () => {
        const board = buildBoard();

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        const saved = JSON.parse(client.hSet.mock.calls.find((c) => c[1].board)[1].board);
        expect(saved[1][0].isOpen).toBe(true);
        expect(saved[2][2].isOpen).toBe(true);
    });

    test('ends the game when an unflagged neighbour is a mine', async () => {
        // No flags, and a 0 so the count still matches.
        const board = buildBoard({ flagMine: false });
        board[1][1].nearbyMines = 0;

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        expect(mockEmit).toHaveBeenCalledWith('gameOver', 'Alice');
    });
});

/*
 * A chord can meet more than one mine. `reveal` ends the game on the first;
 * the loop must stop there rather than keep opening cells.
 */
describe('chordCell that detonates more than one mine', () => {
    /** Two unflagged mines around a 0, so one chord reaches both. */
    const twoMineBoard = () => {
        const board = buildBoard({ flagMine: false });
        board[2][2] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
        board[1][1].nearbyMines = 0; // zero flags placed, so the chord fires
        return board;
    };

    test('announces the loss once, not once per mine', async () => {
        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(twoMineBoard()));

        // A second gameOver re-opens the summary dialog; showModal() on an open dialog throws.
        const gameOvers = mockEmit.mock.calls.filter(([event]) => event === 'gameOver');
        expect(gameOvers).toHaveLength(1);
    });

    test('stops opening cells once the game has ended', async () => {
        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(twoMineBoard()));

        const saved = JSON.parse(client.hSet.mock.calls.find((c) => c[1].board)[1].board);
        const detonated = [saved[0][0].isOpen, saved[2][2].isOpen].filter(Boolean);
        expect(detonated).toHaveLength(1);
    });

    test('scores nothing, as PVP and the daily do for the same move', async () => {
        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(twoMineBoard()));

        expect(client.hSet).not.toHaveBeenCalledWith(
            `player:${SOCKET}`,
            expect.objectContaining({ score: expect.anything() })
        );
    });
});

describe('chordCell when it should do nothing', () => {
    test('does not open anything when the flag count is below the number', async () => {
        const board = buildBoard({ flagMine: false }); // number says 1, zero flags placed

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        expect(lastUpdateCells()).toEqual([]);
        expect(client.hSet).not.toHaveBeenCalledWith(`player:${SOCKET}`, expect.objectContaining({ score: expect.anything() }));
    });

    test('does not open anything when MORE flags are placed than the number', async () => {
        // Over-flagging must refuse, not count as satisfied: a >= would detonate a mis-flagged mine.
        const board = buildBoard();
        board[2][2].isFlagged = true;   // two flags around...
        board[1][1].nearbyMines = 1;    // ...a cell that only wants one

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        expect(lastUpdateCells()).toEqual([]);
        expect(client.hSet).not.toHaveBeenCalledWith(`player:${SOCKET}`, expect.objectContaining({ score: expect.anything() }));
    });

    test('ignores a chord on a closed cell', async () => {
        const board = buildBoard();
        board[1][1].isOpen = false;

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        expect(mockEmit).not.toHaveBeenCalled();
    });

    test.each([
        ['the game is already over', { gameOver: 'true' }],
        ['the game is already won', { gameWon: 'true' }],
    ])('ignores a chord once %s', async (_label, extra) => {
        const board = buildBoard();

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board, extra));

        expect(mockEmit).not.toHaveBeenCalled();
    });

    test.each([
        ['above the board', -1, 1],
        ['below the board', 9, 1],
        ['left of the board', 1, -1],
        ['right of the board', 1, 9],
    ])('ignores coordinates %s', async (_label, row, col) => {
        const board = buildBoard();

        await coop.chordCell(row, col, ROOM, SOCKET, roomStateWith(board));

        expect(mockEmit).not.toHaveBeenCalled();
    });
});

describe('chordCell projection', () => {
    test('does not leak mine positions in the cells it emits', async () => {
        const board = buildBoard();

        await coop.chordCell(1, 1, ROOM, SOCKET, roomStateWith(board));

        // Every emitted cell is an opened safe cell; the flagged mine is never included.
        expect(lastUpdateCells().every((cell) => cell.isMine === false)).toBe(true);
    });
});
