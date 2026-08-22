/**
 * The emote handler.
 *
 * An emote is the first message a player sends another player, so what it
 * REFUSES matters more than what it sends: an id outside the catalog would turn
 * a closed vocabulary into free text, an unbounded rate would make the room
 * unusable for everyone else in it, and a non-member reaching a room would let
 * anyone speak into any game they can name.
 *
 * Drives the REAL registrations against the Redis fake, the same harness as
 * malformedPayloads.test.js — the handler's guards are the thing under test,
 * and they are only guards in the order server.js runs them.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockOn = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    io: { on: mockOn, to: mockTo, use: jest.fn() },
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

/** Connects a socket and returns the handlers server.js registered on it. */
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
    return handlers[CLIENT_EVENTS.SEND_EMOTE];
};

const seedRoom = (mode = 'co-op', players = [ALICE]) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode,
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'true',
        players: JSON.stringify(players),
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0' });
};

/** The playerEmote fan-outs, in order. */
const emotesSent = () =>
    mockEmit.mock.calls.filter(([event]) => event === SERVER_EVENTS.PLAYER_EMOTE).map(([, payload]) => payload);

beforeEach(() => {
    mockRedis.flush();
    mockTo.mockClear();
    mockEmit.mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('a valid emote', () => {
    test('reaches the whole room, sender included', async () => {
        seedRoom();
        const sendEmote = await connect();

        await sendEmote({ room: ROOM, emote: 'nice' });

        // io.to, not socket.to: everyone's copy of the feed should agree, and
        // the sender seeing their own is what confetti already does.
        expect(mockTo).toHaveBeenCalledWith(ROOM);
        expect(emotesSent()).toEqual([{ id: ALICE, name: 'Alice', emote: 'nice', room: ROOM }]);
    });

    test('carries the stored name, not one the client supplied', async () => {
        seedRoom();
        const sendEmote = await connect();

        await sendEmote({ room: ROOM, emote: 'wave', name: 'Someone Else' });

        expect(emotesSent()[0].name).toBe('Alice');
    });

    /*
     * The one place this differs from hover and from the ping that Phase 2
     * adds: those are suppressed in PVP because both racers play the SAME
     * board, so a cursor is a move hint. An emote carries no board information,
     * so racers may taunt each other freely.
     */
    test('is allowed in PVP, unlike hover', async () => {
        seedRoom('pvp');
        const sendEmote = await connect();

        await sendEmote({ room: ROOM, emote: 'hurry' });

        expect(emotesSent()).toHaveLength(1);
    });
});

describe('what it refuses, silently', () => {
    /** Every refusal drops the message; none may answer with an error emit. */
    const expectSilentDrop = (socketEmit) => {
        expect(emotesSent()).toEqual([]);
        if (socketEmit) expect(socketEmit).not.toHaveBeenCalled();
    };

    test('an id outside the catalog', async () => {
        seedRoom();
        const sendEmote = await connect();

        await sendEmote({ room: ROOM, emote: 'not-an-emote' });

        expectSilentDrop();
    });

    /*
     * The guard that keeps the vocabulary closed. Without it the id is just a
     * string being relayed between players, which is chat — with no filter, no
     * report flow and nobody to read the reports.
     */
    test('free text dressed up as an emote', async () => {
        seedRoom();
        const sendEmote = await connect();

        await sendEmote({ room: ROOM, emote: 'meet me at 3pm' });
        await sendEmote({ room: ROOM, emote: '<img src=x onerror=alert(1)>' });

        expectSilentDrop();
    });

    test('a room this socket is not in', async () => {
        seedRoom('co-op', ['sock-somebody-else']);
        const sendEmote = await connect();

        await sendEmote({ room: ROOM, emote: 'nice' });

        expectSilentDrop();
    });

    test('a room that does not exist', async () => {
        const sendEmote = await connect();

        await sendEmote({ room: 'no-such-room', emote: 'nice' });

        expectSilentDrop();
    });
});

describe('the rate limit', () => {
    /*
     * The bucket refills from `performance.now()`, so an unfrozen clock makes
     * every count below a race against how long the loop takes — one earned
     * token on a stalled CI runner turns an exact assertion red for a reason
     * that has nothing to do with the code. Frozen, the burst is the whole
     * allowance and the numbers are exact. Refill itself is covered by
     * rateLimit.test.js, which owns the arithmetic.
     */
    beforeEach(() => jest.spyOn(performance, 'now').mockReturnValue(1000));

    test('allows a burst and then refuses, without erroring', async () => {
        seedRoom();
        const sendEmote = await connect();

        for (let i = 0; i < EXPRESSION_BURST + 5; i++) {
            await sendEmote({ room: ROOM, emote: 'nice' });
        }

        // Exactly the burst, with the clock frozen so nothing is earned back.
        // An off-by-one here is the difference between a limit and a
        // suggestion, which is why this is not a `toBeLessThan`.
        expect(emotesSent()).toHaveLength(EXPRESSION_BURST);
    });

    test('is per socket, so one spammer cannot silence the room', async () => {
        seedRoom('co-op', [ALICE, 'sock-bob']);
        mockRedis.seed('player:sock-bob', { name: 'Bob', room: ROOM, score: '0' });

        const aliceEmote = await connect(ALICE);
        const bobEmote = await connect('sock-bob');

        for (let i = 0; i < EXPRESSION_BURST + 5; i++) {
            await aliceEmote({ room: ROOM, emote: 'nice' });
        }
        mockEmit.mockClear();

        await bobEmote({ room: ROOM, emote: 'wave' });

        expect(emotesSent()).toEqual([{ id: 'sock-bob', name: 'Bob', emote: 'wave', room: ROOM }]);
    });
});
