/**
 * Reloading in the middle of a practice race.
 *
 * A practice race is an ordinary co-op room of one, so a reload already brought
 * the board, the clock and the score back — through the normal `joinRoom`
 * handler, which knows only what the ROOM says. The target the player was
 * racing lived in the browser's memory and nowhere else, so it silently did
 * not come back: no error, no missing board, just an opponent that quietly
 * stopped existing halfway through the run.
 *
 * The fix is that the room records how it was OPENED, the same way it records
 * `mode` and `noGuess`. The target itself is still never server-side and could
 * not be — it comes out of the player's own records — so what travels is one
 * boolean, and the client recomputes the time from it.
 *
 * Drives server.js's real handler, because the bug was in what that handler
 * chooses to describe. Its own harness rather than joinRoomHost.test.js's: that
 * file is about a PVP lobby's host role, and the two share nothing but the
 * shape of the fake socket.
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

        // Without these the client has nothing to look a record up by, and the
        // flag counter is wrong as well.
        expect(payload.numRows).toBe(1);
        expect(payload.numCols).toBe(1);
        expect(payload.numMines).toBe(0);
    });
});

describe('resuming anything else', () => {
    test('an ordinary co-op room is never labelled a practice race', async () => {
        seedRoom({});

        // Absent rather than false: the flag is what puts a target on screen,
        // and every room that is not a practice race must clear one.
        expect(joinPayload(await rejoin()).practice).toBeUndefined();
    });
});
