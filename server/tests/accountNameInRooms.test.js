/**
 * A signed-in player's name reaching the scoreboard. `displayNameFor` has its
 * own tests, but only driving server.js's real handlers (as joinRoomHost.test.js
 * does) shows the handlers actually CALL it; this reads back what landed in Redis.
 */

const emitsByTarget = {};
const mockTo = jest.fn((target) => ({
    emit: (...args) => {
        (emitsByTarget[target] = emitsByTarget[target] || []).push(args);
    },
}));
const mockOn = jest.fn();
const mockUse = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    // Presence scans the live socket map on every connect (utils/presence.js).
    io: { on: mockOn, to: mockTo, use: mockUse, sockets: { sockets: new Map() } },
    server: { listen: jest.fn() },
}));

// The account the socket resolves to, swapped per test. null is signed out.
const mockUser = { current: null };
jest.mock('../controllers/profileController', () => ({
    resolveSocketUser: async () => mockUser.current,
    registerProfileRoutes: jest.fn(),
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

require('../server');

const onConnection = mockOn.mock.calls.find(([event]) => event === 'connection')[1];

// Identity is attached by io.use MIDDLEWARE, not the connection handler; a
// harness that skipped it would see every socket signed out and prove nothing.
const [attachIdentity] = mockUse.mock.calls[0];

const ROOM = 'roomcode';
const SOCKET = 'sock-1';
const ACCOUNT = { id: 'uuid-1', displayName: 'Miguel', avatar: 'fox' };

const makeSocket = (id) => {
    const handlers = {};
    return {
        id,
        handshake: { auth: {} },
        handlers,
        data: {},
        on: (event, fn) => { handlers[event] = fn; },
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
};

const connect = async (id = SOCKET) => {
    const socket = makeSocket(id);
    await new Promise((next) => { attachIdentity(socket, next); });
    await onConnection(socket);
    return socket;
};

const storedName = (id = SOCKET) => mockRedis.read(`player:${id}`)?.name;

const CREATE = { room: ROOM, numRows: 16, numCols: 16, numMines: 40, mode: 'co-op' };

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
    for (const key of Object.keys(emitsByTarget)) delete emitsByTarget[key];
    mockUser.current = null;
});

describe('creating a room', () => {
    test('a signed-in player is stored under their ACCOUNT name', async () => {
        mockUser.current = ACCOUNT;
        const socket = await connect();

        await socket.handlers.createRoom({ ...CREATE, name: 'Somebody Else' });

        expect(storedName()).toBe('Miguel');
    });

    test('a guest is stored under the name they typed', async () => {
        const socket = await connect();

        await socket.handlers.createRoom({ ...CREATE, name: 'Guest' });

        expect(storedName()).toBe('Guest');
    });

    /*
     * The client skipped its name dialog believing it was signed in; if the
     * token did not resolve here, the name it sent is the only one there is.
     */
    test('an unresolved account still creates, on the name the client sent', async () => {
        const socket = await connect();

        await socket.handlers.createRoom({ ...CREATE, name: 'Miguel' });

        expect(storedName()).toBe('Miguel');
        expect(socket.emit).not.toHaveBeenCalledWith('createRoomError');
    });
});

describe('joining a room', () => {
    const GUEST_SOCKET = 'sock-2';

    const seedRoom = async () => {
        const host = await connect();
        await host.handlers.createRoom({ ...CREATE, name: 'Host' });
        return host;
    };

    test('a signed-in player joins under their ACCOUNT name', async () => {
        await seedRoom();
        mockUser.current = ACCOUNT;
        const guest = await connect(GUEST_SOCKET);

        await guest.handlers.joinRoom({ room: ROOM, name: 'Somebody Else' });

        expect(storedName(GUEST_SOCKET)).toBe('Miguel');
    });

    test('a guest joins under the name they typed', async () => {
        await seedRoom();
        const guest = await connect(GUEST_SOCKET);

        await guest.handlers.joinRoom({ room: ROOM, name: 'Guest' });

        expect(storedName(GUEST_SOCKET)).toBe('Guest');
    });
});
