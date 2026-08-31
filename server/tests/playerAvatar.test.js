/**
 * The avatar's trip into a room: socket.data.user (the connect-time snapshot)
 * → the player record → the score-table broadcast. Follows the
 * joinRoomHost.test.js pattern of driving server.js's own handlers, because
 * the interesting failure is silent: a dropped avatar just renders every row
 * name-only and nothing errors.
 */

const emitsByTarget = {};
const mockTo = jest.fn((target) => ({
    emit: (...args) => {
        (emitsByTarget[target] = emitsByTarget[target] || []).push(args);
    },
}));
const mockOn = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    // `sockets.sockets` is socket.io's live connection map, empty here for the
    // same reason as in setup/mockInfra.js. Presence walks it on every connect
    // (utils/presence.js); without it these suites boot the server against an
    // `io` that socket.io could not produce, and log a caught failure per test.
    io: { on: mockOn, to: mockTo, use: jest.fn() , sockets: { sockets: new Map() } },
    server: { listen: jest.fn() },
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

require('../server');

const onConnection = mockOn.mock.calls.find(([event]) => event === 'connection')[1];

const ROOM = 'r-avatar';

/** A fake socket; `user` becomes socket.data.user, as the io middleware would. */
const makeSocket = (id, user) => {
    const handlers = {};
    return {
        id,
        data: { user },
        handshake: { auth: {} },
        handlers,
        on: (event, fn) => { handlers[event] = fn; },
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
};

const seedRoom = () => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'co-op',
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        numRows: '1',
        numCols: '1',
        numMines: '0',
        // The co-op join path re-broadcasts the board, so one has to exist.
        board: JSON.stringify([[{ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }]]),
        players: JSON.stringify([]),
    });
};

const join = async (socketId, user, name) => {
    const socket = makeSocket(socketId, user);
    await onConnection(socket);
    await socket.handlers.joinRoom({ room: ROOM, name });
    return socket;
};

/** The score-table rows from the LAST stats broadcast to the room. */
const lastStats = () => {
    const stats = (emitsByTarget[ROOM] || []).filter(([event]) => event === 'playerStatsUpdate');
    return stats[stats.length - 1][1];
};

beforeEach(() => {
    mockRedis.flush();
    Object.keys(emitsByTarget).forEach((key) => delete emitsByTarget[key]);
    seedRoom();
});

test('a signed-in join lands the avatar on the record and in the score table', async () => {
    await join('sock-1', { id: 'uuid-1', displayName: 'Miguel', avatar: 'fox' }, 'Miguel');

    expect(mockRedis.read('player:sock-1').avatar).toBe('fox');
    expect(lastStats()).toEqual([{ name: 'Miguel', avatar: 'fox', score: 0 }]);
});

test('an anonymous join stores no avatar and broadcasts null', async () => {
    await join('sock-1', null, 'Guest');

    expect(mockRedis.read('player:sock-1').avatar).toBe('');
    expect(lastStats()).toEqual([{ name: 'Guest', avatar: null, score: 0 }]);
});

test('an id the catalog does not know is dropped at the door', async () => {
    await join('sock-1', { id: 'uuid-1', displayName: 'M', avatar: 'not-a-real-id' }, 'M');

    expect(mockRedis.read('player:sock-1').avatar).toBe('');
    expect(lastStats()).toEqual([{ name: 'M', avatar: null, score: 0 }]);
});

test('a rejoin overwrites the stored avatar — signing out between joins clears it', async () => {
    await join('sock-1', { id: 'uuid-1', displayName: 'Miguel', avatar: 'fox' }, 'Miguel');
    // Same socket joins again signed OUT: the record exists, so this exercises
    // the setFields branch, and a stale 'fox' must not survive it.
    await join('sock-1', null, 'Miguel');

    expect(mockRedis.read('player:sock-1').avatar).toBe('');
    expect(lastStats()).toEqual([{ name: 'Miguel', avatar: null, score: 0 }]);
});

test('a rejoin after signing IN gains the avatar the first join lacked', async () => {
    await join('sock-1', null, 'Miguel');
    await join('sock-1', { id: 'uuid-1', displayName: 'Miguel', avatar: 'robot' }, 'Miguel');

    expect(mockRedis.read('player:sock-1').avatar).toBe('robot');
});

test('signed-in and anonymous players share one table, each row honest', async () => {
    await join('sock-1', { id: 'uuid-1', displayName: 'Miguel', avatar: 'penguin' }, 'Miguel');
    await join('sock-2', null, 'Guest');

    expect(lastStats()).toEqual([
        { name: 'Miguel', avatar: 'penguin', score: 0 },
        { name: 'Guest', avatar: null, score: 0 },
    ]);
});
