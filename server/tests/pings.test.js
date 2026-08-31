/**
 * The ping handler.
 *
 * One guard here matters more than everything else in this file: **a ping must
 * never reach a PVP room.** Both racers play the SAME board (`startPvpGame`
 * builds it once), so a cell somebody points at is a move hint delivered
 * straight to their opponent's screen — "this one is safe", or "this one is a
 * mine", is the entire content of a ping. Hover is suppressed for exactly this
 * reason; an emote is not, because it carries no board information.
 *
 * Same harness as emotes.test.js: the real registrations against the Redis fake.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
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

const { CLIENT_EVENTS, SERVER_EVENTS } = require('../../shared/events');
const { EXPRESSION_BURST } = require('../domain/rateLimit');

const onConnection = mockOn.mock.calls.find(([event]) => event === 'connection')[1];

const ROOM = 'room-1';
const ALICE = 'sock-alice';

/** Connects a socket and returns both expression handlers it registered. */
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

/*
 * Dimensions are part of the seed, not decoration: the handler bounds a ping
 * against the ROOM's board, so a room without them relays nothing.
 */
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
    /*
     * The guard this whole feature turns on. If this test ever goes green with
     * the mode check removed, pings have become a cheat in the race mode.
     */
    test('never delivers a ping, however valid it looks', async () => {
        seedRoom('pvp');
        const { pingCell } = await connect();

        await pingCell({ room: ROOM, row: 4, col: 7 });

        expect(pingsSent()).toEqual([]);
    });

    // The contrast that makes the rule legible: same room, same socket, and an
    // emote goes through — a reaction says nothing about the board.
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
     * The global 0..100 rule passes anything a small board cannot hold, and it
     * has to: it runs before any room is loaded. On a 2x3 board (2, 3) is two
     * cells past the last one in both axes, and a relayed ping is drawn and
     * announced straight from these numbers — so the room's own dimensions are
     * the only thing that can refuse it.
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

        // The same small board still relays its own last cell, so the rule is
        // an off-by-one away from refusing every ping on it.
        test('but the last cell it does have still goes through', async () => {
            seedRoom('co-op', [ALICE], { numRows: 2, numCols: 3 });
            const { pingCell } = await connect();

            await pingCell({ room: ROOM, row: 1, col: 2 });

            expect(pingsSent()).toEqual([{ id: ALICE, name: 'Alice', row: 1, col: 2, room: ROOM }]);
        });

        // A room hash with no dimensions cannot bound anything; refuse rather
        // than fall back to the global cap.
        test('a room with no dimensions stored', async () => {
            seedRoom('co-op', [ALICE], { numRows: '', numCols: '' });
            const { pingCell } = await connect();

            await pingCell({ room: ROOM, row: 1, col: 1 });

            expect(pingsSent()).toEqual([]);
        });
    });

    /*
     * (-1,-1) means "no longer hovering" to cellHover. A ping has no such
     * state — it expires on its own — so the sentinel is just an off-board
     * coordinate here, and `isValidCoordinate` is the right rule rather than
     * `isValidHoverCoordinate`.
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

    /*
     * The reason there is one bucket rather than two: alternating between the
     * events must not buy a client double the rate. Spend the whole allowance
     * on emotes and the very next ping has to be refused.
     */
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
