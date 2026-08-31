/**
 * A malformed payload must not take the process down.
 *
 * Every handler in server.js destructures its payload in the PARAMETER LIST,
 * which runs before the handler's own try/catch — so the careful catches inside
 * them could never see it. Emitting an event with no payload threw a TypeError
 * nothing in server.js could catch, and in an `async` listener that is an
 * unhandled rejection, which Node treats as fatal.
 *
 * The blast radius is what makes this the worst bug in the protocol: it is not
 * one player's request failing, it is every game on the server ending, and any
 * client can do it with a single message and no authentication. Reproduced
 * against a running server for `joinRoom`, `findMatch` and `startPracticeRace`
 * before this was fixed; each killed it on its own.
 *
 * These drive the REAL registrations, the same way joinRoomHost.test.js does,
 * because the bug lived in how they were registered rather than in what any of
 * them does.
 */

const mockOn = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    // `sockets.sockets` is socket.io's live connection map, empty here for the
    // same reason as in setup/mockInfra.js. Presence walks it on every connect
    // (utils/presence.js); without it these suites boot the server against an
    // `io` that socket.io could not produce, and log a caught failure per test.
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

/** Connects a socket and returns the handlers server.js registered on it. */
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

/** Every payload-carrying event, i.e. everything a client can address. */
const EVENTS = Object.values(CLIENT_EVENTS);

beforeEach(() => {
    mockRedis.flush();
    // The handlers log refusals; nothing here is about what they say.
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

        /*
         * The listener must SETTLE rather than reject. A rejection here is the
         * bug: socket.io does not catch it, so it reaches the process as an
         * unhandled rejection and Node exits.
         */
        await expect(Promise.resolve(handler(payload))).resolves.not.toThrow();
    });
});
