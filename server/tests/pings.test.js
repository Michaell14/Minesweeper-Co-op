/**
 * The ping handler. The guard that matters: a ping must never reach a PVP
 * room, since both racers play the same board and a ping is a move hint.
 * Hover is suppressed for the same reason; an emote carries no board info.
 * Same harness as emotes.test.js: real registrations against the Redis fake.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockOn = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    // `sockets.sockets` is socket.io's live connection map; presence walks it
    // on every connect (utils/presence.js). Same as setup/mockInfra.js.
    io: { on: mockOn, to: mockTo, use: jest.fn() , sockets: { sockets: new Map() } },
    server: { listen: jest.fn() },
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

require('../server');

const { CLIENT_EVENTS, SERVER_EVENTS } = require('../../shared/events');
const { EXPRESSION_BURST } = require('../domain/rateLimit');

const onConnection = mockOn.mock.calls.find(([event]) => event === 'connection')[1];

const ROOM = 'room-1';
const ALICE = 'sock-alice';

/** Connects a socket and returns both expression handlers. */
const connect = async (id = ALICE) => {
    const handlers = {};
    const socket = {
        id,
        data: {},
        handshake: { auth: { sessionId: `sess-${id}` } },
        on: (event, fn) => { handlers[event] = fn; },
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
    await onConnection(socket);
    return {
        pingCell: handlers[CLIENT_EVENTS.PING_CELL],
        sendEmote: handlers[CLIENT_EVENTS.SEND_EMOTE],
        socket,
    };
};

/* Dimensions matter: the handler bounds a ping against the room's board. */
const seedRoom = (mode = 'co-op', players = [ALICE], { numRows = 16, numCols = 16 } = {}) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode,
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'true',
        numRows: String(numRows),
        numCols: String(numCols),
        players: JSON.stringify(players),
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0' });
};

const pingsSent = () =>
    mockEmit.mock.calls.filter(([event]) => event === SERVER_EVENTS.PLAYER_PING).map(([, payload]) => payload);

beforeEach(() => {
    mockRedis.flush();
    mockTo.mockClear();
    mockEmit.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('a valid ping', () => {
    test('reaches the whole room with the cell it names', async () => {
        seedRoom();
        const { pingCell } = await connect();

        await pingCell({ room: ROOM, row: 4, col: 7 });

        expect(mockTo).toHaveBeenCalledWith(ROOM);
        expect(pingsSent()).toEqual([{ id: ALICE, name: 'Alice', row: 4, col: 7, room: ROOM }]);
    });

    test('carries the stored name, not one the client supplied', async () => {
        seedRoom();
        const { pingCell } = await connect();

        await pingCell({ room: ROOM, row: 0, col: 0, name: 'Someone Else' });

        expect(pingsSent()[0].name).toBe('Alice');
    });
});

describe('PVP', () => {
    /* The guard the feature turns on: without it, pings are a cheat in the race. */
    test('never delivers a ping, however valid it looks', async () => {
        seedRoom('pvp');
        const { pingCell } = await connect();

        await pingCell({ room: ROOM, row: 4, col: 7 });

        expect(pingsSent()).toEqual([]);
    });

    // Same room, same socket: an emote goes through, since it says nothing about the board.
    test('still delivers an emote from the same room', async () => {
        seedRoom('pvp');
        const { pingCell, sendEmote } = await connect();

        await pingCell({ room: ROOM, row: 4, col: 7 });
        await sendEmote({ room: ROOM, emote: 'nice' });

        expect(pingsSent()).toEqual([]);
        expect(mockEmit.mock.calls.filter(([e]) => e === SERVER_EVENTS.PLAYER_EMOTE)).toHaveLength(1);
    });
});

describe('what it refuses, silently', () => {
    test.each([
        ['a negative row', { row: -1, col: 3 }],
        ['the hover clear sentinel', { row: -1, col: -1 }],
        ['a coordinate past the cap', { row: 5000, col: 1 }],
        ['a fractional coordinate', { row: 1.5, col: 2 }],
        ['a string coordinate', { row: '3', col: '4' }],
        ['a missing coordinate', { row: 3 }],
    ])('%s', async (_label, coords) => {
        seedRoom();
        const { pingCell } = await connect();

        await pingCell({ room: ROOM, ...coords });

        expect(pingsSent()).toEqual([]);
    });

    /*
     * The global 0..100 rule runs before any room is loaded, so the room's own
     * dimensions are the only thing that can refuse an off-board ping.
     */
    describe('a cell the room does not have', () => {
        test.each([
            ['a row past the last one', { row: 2, col: 1 }],
            ['a column past the last one', { row: 1, col: 3 }],
            ['both past the end', { row: 2, col: 3 }],
        ])('%s', async (_label, coords) => {
            seedRoom('co-op', [ALICE], { numRows: 2, numCols: 3 });
            const { pingCell } = await connect();

            await pingCell({ room: ROOM, ...coords });

            expect(pingsSent()).toEqual([]);
        });

        // The bound is an off-by-one away from refusing every ping on the board.
        test('but the last cell it does have still goes through', async () => {
            seedRoom('co-op', [ALICE], { numRows: 2, numCols: 3 });
            const { pingCell } = await connect();

            await pingCell({ room: ROOM, row: 1, col: 2 });

            expect(pingsSent()).toEqual([{ id: ALICE, name: 'Alice', row: 1, col: 2, room: ROOM }]);
        });

        // No dimensions means nothing to bound against; refuse rather than fall back.
        test('a room with no dimensions stored', async () => {
            seedRoom('co-op', [ALICE], { numRows: '', numCols: '' });
            const { pingCell } = await connect();

            await pingCell({ room: ROOM, row: 1, col: 1 });

            expect(pingsSent()).toEqual([]);
        });
    });

    /*
     * A ping expires on its own, so cellHover's (-1,-1) sentinel is just an
     * off-board coordinate here: `isValidCoordinate`, not `isValidHoverCoordinate`.
     */
    test('a room this socket is not in', async () => {
        seedRoom('co-op', ['sock-somebody-else']);
        const { pingCell } = await connect();

        await pingCell({ room: ROOM, row: 1, col: 1 });

        expect(pingsSent()).toEqual([]);
    });

    test('a room that does not exist', async () => {
        const { pingCell } = await connect();

        await pingCell({ room: 'no-such-room', row: 1, col: 1 });

        expect(pingsSent()).toEqual([]);
    });
});

describe('the expression bucket is shared with emotes', () => {
    beforeEach(() => jest.spyOn(performance, 'now').mockReturnValue(1000));

    /* One bucket, not two: alternating events must not buy double the rate. */
    test('emotes spend the allowance a ping would have used', async () => {
        seedRoom();
        const { pingCell, sendEmote } = await connect();

        for (let i = 0; i < EXPRESSION_BURST; i++) {
            await sendEmote({ room: ROOM, emote: 'nice' });
        }
        await pingCell({ room: ROOM, row: 2, col: 2 });

        expect(pingsSent()).toEqual([]);
    });

    test('and the other way round', async () => {
        seedRoom();
        const { pingCell, sendEmote } = await connect();

        for (let i = 0; i < EXPRESSION_BURST; i++) {
            await pingCell({ room: ROOM, row: 2, col: 2 });
        }
        mockEmit.mockClear();
        await sendEmote({ room: ROOM, emote: 'nice' });

        expect(mockEmit.mock.calls.filter(([e]) => e === SERVER_EVENTS.PLAYER_EMOTE)).toEqual([]);
    });
});
