/**
 * The emote handler. An emote is the first message a player sends another, so
 * what it REFUSES matters most: an id outside the catalog is free text, an
 * unbounded rate makes the room unusable, a non-member could speak into any
 * game. Drives the REAL registrations against the Redis fake, as
 * malformedPayloads.test.js does, since the guards only guard in server.js's order.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockOn = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    // `sockets.sockets` is socket.io's live connection map, which presence
    // walks on every connect (utils/presence.js); see setup/mockInfra.js.
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

        // io.to, not socket.to: everyone's copy of the feed should agree.
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
     * Hover and ping are suppressed in PVP because both racers play the SAME
     * board; an emote carries no board information.
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
     * The guard that keeps the vocabulary closed. Without it the id is relayed
     * free text, which is chat with no filter and no report flow.
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
     * The bucket refills from `performance.now()`; frozen, the burst is the
     * whole allowance and the counts are exact. Refill arithmetic is
     * rateLimit.test.js's job.
     */
    beforeEach(() => jest.spyOn(performance, 'now').mockReturnValue(1000));

    test('allows a burst and then refuses, without erroring', async () => {
        seedRoom();
        const sendEmote = await connect();

        for (let i = 0; i < EXPRESSION_BURST + 5; i++) {
            await sendEmote({ room: ROOM, emote: 'nice' });
        }

        // Exactly the burst, with the clock frozen. An off-by-one is the
        // difference between a limit and a suggestion, so not `toBeLessThan`.
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
