/**
 * A malformed payload must not take the process down. Handlers destructure
 * their payload in the parameter list, before their own try/catch, and an
 * async listener's TypeError is an unhandled rejection that ends every game
 * on the server. Drives the real registrations, like joinRoomHost.test.js,
 * since the bug lived in how they were registered.
 */

const mockOn = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    // `sockets.sockets` is socket.io's live connection map; presence walks it
    // on every connect (utils/presence.js). Same as setup/mockInfra.js.
    io: { on: mockOn, to: jest.fn(() => ({ emit: jest.fn() })), use: jest.fn() , sockets: { sockets: new Map() } },
    server: { listen: jest.fn() },
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

require('../server');

const { CLIENT_EVENTS } = require('../../shared/events');

const onConnection = mockOn.mock.calls.find(([event]) => event === 'connection')[1];

/** Connects a socket and returns the handlers registered on it. */
const handlersOf = async () => {
    const handlers = {};
    const socket = {
        id: 'sock-malformed',
        handshake: { auth: { sessionId: 'sess-malformed' } },
        on: (event, fn) => { handlers[event] = fn; },
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
    await onConnection(socket);
    return handlers;
};

/** Everything a client can address. */
const EVENTS = Object.values(CLIENT_EVENTS);

beforeEach(() => {
    mockRedis.flush();
    // The handlers log refusals.
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe.each([
    ['no payload at all', undefined],
    ['null', null],
    ['a string', 'not-an-object'],
    ['a number', 42],
    ['an empty object', {}],
])('%s', (_label, payload) => {
    test.each(EVENTS)('%s survives it', async (event) => {
        const handlers = await handlersOf();
        const handler = handlers[event];
        expect(handler).toBeDefined();

        /* Must settle, not reject: socket.io does not catch it, and Node exits. */
        await expect(Promise.resolve(handler(payload))).resolves.not.toThrow();
    });
});
