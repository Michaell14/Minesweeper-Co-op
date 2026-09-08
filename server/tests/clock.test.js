/**
 * The run clock. Stored as two timestamps rather than an elapsed count, so
 * what matters is WHEN the stamps are written and that they are emitted
 * alongside the state change they describe; a clock that starts on room
 * creation or keeps running after a loss only shows up as a number that
 * disagrees with the board.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const coop = require('../game/coop');
const { clockOf, stoppedAt, readStamp } = require('../domain/clock');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const SOCKET = 'sock-1';
let client;

/** 3x3, one mine at (0,0), honest counts: a cascade from (2,2) stops at the ring of 1s. */
const freshBoard = () => {
    const board = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }))
    );
    board[0][0] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    [[0, 1], [1, 0], [1, 1]].forEach(([r, c]) => { board[r][c].nearbyMines = 1; });
    return board;
};

const SAFE_CELL = [2, 2];
const MINE_CELL = [0, 0];

const snapshot = (overrides = {}) => ({
    gameOver: 'false',
    gameWon: 'false',
    initialized: 'true',
    board: JSON.stringify(freshBoard()),
    numRows: '3',
    numCols: '3',
    numMines: '1',
    players: JSON.stringify([SOCKET]),
    ...overrides,
});

/** Every field written across all hSet calls, merged. */
const writtenFields = () =>
    client.hSet.mock.calls.reduce((acc, [, fields]) => Object.assign(acc, fields || {}), {});

const clockPayloads = () =>
    mockEmit.mock.calls.filter(([event]) => event === 'gameClock').map(([, payload]) => payload);

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    // acquireInitLock is a SET NX; without this the first-reveal path never runs.
    client.set.mockResolvedValue('OK');
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'players') return JSON.stringify([SOCKET]);
        if (field === 'name') return 'Alice';
        if (field === 'score') return '0';
        if (field === 'gameWon') return 'false';
        if (field === 'startedAt') return '1000';
        return null;
    });
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:') ? snapshot({ startedAt: '1000' }) : { name: 'Alice', score: '0' }
    );
});

describe('reading the clock off room state', () => {
    test('absent stamps read as null, not NaN', () => {
        expect(clockOf({})).toEqual({ startedAt: null, endedAt: null });
    });

    test('cleared stamps read as null', () => {
        // resetGame writes '' rather than deleting the field.
        expect(clockOf({ startedAt: '', endedAt: '' })).toEqual({ startedAt: null, endedAt: null });
    });

    test('stored strings come back as numbers', () => {
        expect(clockOf({ startedAt: '1000', endedAt: '4000' })).toEqual({ startedAt: 1000, endedAt: 4000 });
    });

    test('a stop keeps the start it was given', () => {
        expect(stoppedAt({ startedAt: '1000' }, 4000)).toEqual({ startedAt: 1000, endedAt: 4000 });
    });

    test('a stop on a room that never started still reports null', () => {
        expect(stoppedAt({}, 4000)).toEqual({ startedAt: null, endedAt: 4000 });
    });

    test('garbage reads as null rather than NaN', () => {
        expect(readStamp('not-a-number')).toBeNull();
    });
});

describe('starting', () => {
    /*
     * A 5x5 rather than the 3x3 fixture: the first reveal regenerates the
     * board, and on a tiny one the opening cascade can win outright, stopping
     * the clock in the same call.
     */
    const firstReveal = () => snapshot({
        initialized: 'false',
        numRows: '5',
        numCols: '5',
        numMines: '5',
    });

    test('the first reveal stamps startedAt', async () => {
        await coop.openCell(2, 2, ROOM, SOCKET, firstReveal(), 0, {});

        expect(readStamp(writtenFields().startedAt)).not.toBeNull();
    });

    test('and announces it, so every player in the room agrees', async () => {
        await coop.openCell(2, 2, ROOM, SOCKET, firstReveal(), 0, {});

        expect(clockPayloads()[0].startedAt).toBe(1000);
    });

    test('a later reveal does not restamp it', async () => {
        await coop.openCell(...SAFE_CELL, ROOM, SOCKET, snapshot(), 0, {});

        expect(writtenFields().startedAt).toBeUndefined();
    });
});

describe('stopping', () => {
    test('hitting a mine stamps endedAt', async () => {
        await coop.openCell(...MINE_CELL, ROOM, SOCKET, snapshot(), 0, {});

        expect(readStamp(writtenFields().endedAt)).not.toBeNull();
    });

    test('and sends the stop with the start still attached', async () => {
        await coop.openCell(...MINE_CELL, ROOM, SOCKET, snapshot(), 0, {});

        const [payload] = clockPayloads();
        expect(payload.startedAt).toBe(1000);
        expect(payload.endedAt).not.toBeNull();
    });

    test('the stop is sent alongside the loss, not on its own', async () => {
        await coop.openCell(...MINE_CELL, ROOM, SOCKET, snapshot(), 0, {});

        const events = mockEmit.mock.calls.map(([event]) => event);
        expect(events).toContain('gameOver');
        expect(events).toContain('gameClock');
    });
});
