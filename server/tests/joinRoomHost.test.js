/**
 * Rejoining a PVP lobby as the host that just reloaded.
 *
 * `addPlayerToRoom` moves the host role onto the new socket, because a reload
 * should not cost you the Start button. The join handler then has to describe
 * the room it just changed — and it used to describe the one it read BEFORE the
 * change, which named a socket that had already gone.
 *
 * Two things broke at once, both silently. The returning host was told
 * `isHost: false`, so no Start button; and `players.find(p => p !== hostSocket)`
 * was comparing against an id no longer in the list, so it picked the FIRST
 * player — the host — as the guest, and sent the host's pvpRoomReady to a dead
 * socket. Neither player could start the game.
 *
 * One of two tests that drive server.js's own socket handlers (the other is
 * practiceResume.test.js). They are
 * registered inside `io.on('connection')`, so the connection callback is
 * captured from the mocked io and invoked with a fake socket; the Redis fake
 * gives it a real store, which is what makes a stale read observable at all.
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
    io: { on: mockOn, to: mockTo, use: jest.fn() },
    server: { listen: jest.fn() },
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

require('../server');

/** server.js registers everything inside its single connection handler. */
const onConnection = mockOn.mock.calls.find(([event]) => event === 'connection')[1];

const ROOM = 'r1';
const OLD_HOST = 'sock-host-old';
const NEW_HOST = 'sock-host-new';
const GUEST = 'sock-guest';
const HOST_SESSION = 'sess-host';

/** A fake socket that records the handlers server.js registers on it. */
const makeSocket = (id, sessionId) => {
    const handlers = {};
    return {
        id,
        handshake: { auth: { sessionId } },
        handlers,
        on: (event, fn) => { handlers[event] = fn; },
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
};

/**
 * The room as it stands the moment the reloaded host comes back: the disconnect
 * has already run `removePlayer`, so only the guest is listed, but `hostSocket`
 * still names the socket that left.
 */
const seedLobby = () => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'pvp',
        pvpStarted: 'false',
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'false',
        numRows: '16',
        numCols: '16',
        numMines: '40',
        hostSocket: OLD_HOST,
        player1Socket: '',
        player2Socket: '',
        players: JSON.stringify([GUEST]),
    });
    mockRedis.seed(`player:${GUEST}`, { room: ROOM, name: 'Guest', score: '0' });
    mockRedis.seed(`session:${HOST_SESSION}`, { room: ROOM, name: 'Host', socketId: OLD_HOST });
};

/** Connects the returning host and runs the joinRoom their client answers with. */
const rejoinAsHost = async () => {
    const socket = makeSocket(NEW_HOST, HOST_SESSION);
    await onConnection(socket);
    await socket.handlers.joinRoom({ room: ROOM, name: 'Host' });
    return socket;
};

const payloadsFor = (target, event) =>
    (emitsByTarget[target] || []).filter(([name]) => name === event).map(([, payload]) => payload);

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
    for (const key of Object.keys(emitsByTarget)) delete emitsByTarget[key];
    seedLobby();
});

describe('a PVP host who reloads in the lobby', () => {
    test('keeps the host role in Redis', async () => {
        await rejoinAsHost();

        expect(mockRedis.read(`room:${ROOM}`).hostSocket).toBe(NEW_HOST);
    });

    test('is told they are the host, so the Start button comes back', async () => {
        const socket = await rejoinAsHost();

        const [payload] = socket.emit.mock.calls
            .filter(([event]) => event === 'joinRoomSuccess')
            .map(([, data]) => data);
        expect(payload.isHost).toBe(true);
    });

    test('is paired with the OTHER player, not with themselves', async () => {
        await rejoinAsHost();

        expect(payloadsFor(NEW_HOST, 'pvpRoomReady')).toEqual([
            { opponentName: 'Guest', opponentAvatar: null, isHost: true },
        ]);
        expect(payloadsFor(GUEST, 'pvpRoomReady')).toEqual([
            { opponentName: 'Host', opponentAvatar: null, isHost: false },
        ]);
    });

    test('sends nothing to the socket that left', async () => {
        await rejoinAsHost();

        expect(emitsByTarget[OLD_HOST]).toBeUndefined();
    });
});

/*
 * A PVP room holds two. The check that enforces it cannot recognise a
 * reconnecting player by socket id — theirs is new — and cannot be made on a
 * snapshot either, since two people can read "there is space" at the same time.
 */
describe('the two-player limit', () => {
    /** A full lobby: both slots taken, neither of them this browser. */
    const seedFull = () => {
        mockRedis.seed(`room:${ROOM}`, {
            ...mockRedis.read(`room:${ROOM}`),
            players: JSON.stringify([OLD_HOST, GUEST]),
        });
        mockRedis.seed(`player:${OLD_HOST}`, { room: ROOM, name: 'Host', score: '0' });
    };

    const join = async (id, sessionId, name) => {
        const socket = makeSocket(id, sessionId);
        await onConnection(socket);
        await socket.handlers.joinRoom({ room: ROOM, name });
        return socket;
    };

    const wasToldFull = (socket) =>
        socket.emit.mock.calls.some(([event]) => event === 'pvpRoomFull');

    test('turns a genuine third player away', async () => {
        seedFull();

        const socket = await join('sock-third', 'sess-third', 'Third');

        expect(wasToldFull(socket)).toBe(true);
        expect(mockRedis.read(`room:${ROOM}`).players).toBe(JSON.stringify([OLD_HOST, GUEST]));
    });

    /*
     * A reload races its own disconnect. If the new socket connects before the
     * old one's removal is processed, the players list still holds two — and
     * the returning player was shown "Room Full!" for their own room. The
     * session is the one thing that spans both sockets, so it is what the check
     * has to ask.
     */
    test('lets a reconnecting player back in while their old socket is still listed', async () => {
        seedFull();

        const socket = await join(NEW_HOST, HOST_SESSION, 'Host');

        expect(wasToldFull(socket)).toBe(false);
        expect(mockRedis.read(`room:${ROOM}`).players).toContain(NEW_HOST);
    });

    /*
     * Unlocked, both of these read a room with one free slot and both take it,
     * leaving three players in a room `startPvpGame` refuses to start — a lobby
     * that can never begin, with nothing on screen to say why.
     */
    test('two players arriving together cannot both take the last slot', async () => {
        mockRedis.seed(`room:${ROOM}`, {
            ...mockRedis.read(`room:${ROOM}`),
            players: JSON.stringify([GUEST]),
        });

        const [a, b] = await Promise.all([
            join('sock-a', 'sess-a', 'A'),
            join('sock-b', 'sess-b', 'B'),
        ]);

        const players = JSON.parse(mockRedis.read(`room:${ROOM}`).players);
        expect(players).toHaveLength(2);
        expect([wasToldFull(a), wasToldFull(b)].filter(Boolean)).toHaveLength(1);
    });
});

describe('an ordinary guest joining a PVP lobby', () => {
    test('is not made host by the re-read', async () => {
        mockRedis.seed(`room:${ROOM}`, {
            ...mockRedis.read(`room:${ROOM}`),
            players: JSON.stringify([OLD_HOST]),
        });
        mockRedis.seed(`player:${OLD_HOST}`, { room: ROOM, name: 'Host', score: '0' });

        const socket = makeSocket(GUEST, 'sess-guest');
        await onConnection(socket);
        await socket.handlers.joinRoom({ room: ROOM, name: 'Guest' });

        const [payload] = socket.emit.mock.calls
            .filter(([event]) => event === 'joinRoomSuccess')
            .map(([, data]) => data);
        expect(payload.isHost).toBe(false);
        expect(mockRedis.read(`room:${ROOM}`).hostSocket).toBe(OLD_HOST);
    });
});
