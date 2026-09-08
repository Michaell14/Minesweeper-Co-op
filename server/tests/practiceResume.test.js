/**
 * Reloading mid practice race. The room is an ordinary co-op room of one, so
 * `joinRoom` already brought back board, clock and score, but the target
 * lived only in the browser and silently did not return. The room now records
 * how it was OPENED (like `mode` and `noGuess`) as one boolean; the client
 * recomputes the time. Own harness rather than joinRoomHost.test.js's: the two
 * share only the fake socket's shape.
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
    // `sockets.sockets` is socket.io's live map, empty here as in
    // setup/mockInfra.js; presence walks it on every connect.
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

const ROOM = 'SOLO-ABC123';
const OLD_SOCKET = 'sock-old';
const NEW_SOCKET = 'sock-new';
const SESSION = 'sess-1';

const makeSocket = (id) => {
    const handlers = {};
    return {
        id,
        handshake: { auth: { sessionId: SESSION } },
        handlers,
        on: (event, fn) => { handlers[event] = fn; },
        emit: jest.fn(),
        join: jest.fn(),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
};

/** A one-cell board is enough: nothing here reads the layout. */
const BOARD = [[{ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }]];

/** The room as it stands when the reloaded player comes back. */
const seedRoom = (extra) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'co-op',
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'true',
        numRows: '1',
        numCols: '1',
        numMines: '0',
        board: JSON.stringify(BOARD),
        players: JSON.stringify([]),
        ...extra,
    });
    mockRedis.seed(`session:${SESSION}`, { room: ROOM, name: 'Solo', socketId: OLD_SOCKET });
};

/** Reconnects and runs the joinRoom the resumed client answers with. */
const rejoin = async () => {
    const socket = makeSocket(NEW_SOCKET);
    await onConnection(socket);
    await socket.handlers.joinRoom({ room: ROOM, name: 'Solo' });
    return socket;
};

const joinPayload = (socket) =>
    socket.emit.mock.calls.filter(([event]) => event === 'joinRoomSuccess').map(([, data]) => data)[0];

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
    for (const key of Object.keys(emitsByTarget)) delete emitsByTarget[key];
});

describe('resuming a practice race', () => {
    test('the room is told it is one, so the target comes back with the board', async () => {
        seedRoom({ practice: 'true' });

        const socket = await rejoin();

        expect(joinPayload(socket).practice).toBe(true);
    });

    test('the dimensions come too, since the target is recomputed from them', async () => {
        seedRoom({ practice: 'true' });

        const payload = joinPayload(await rejoin());

        // Without these the client has nothing to look a record up by.
        expect(payload.numRows).toBe(1);
        expect(payload.numCols).toBe(1);
        expect(payload.numMines).toBe(0);
    });
});

describe('resuming anything else', () => {
    test('an ordinary co-op room is never labelled a practice race', async () => {
        seedRoom({});

        // Absent rather than false: the flag is what puts a target on screen.
        expect(joinPayload(await rejoin()).practice).toBeUndefined();
    });
});
