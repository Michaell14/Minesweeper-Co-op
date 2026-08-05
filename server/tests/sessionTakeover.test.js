/**
 * A session id is the only credential a returning player presents.
 *
 * Whoever sends one is offered that session's room code and display name, and
 * on the join that follows inherits its seat — the previous socket's player
 * record is deleted and the room slot repointed. Nothing bound it to a socket,
 * an account or an address, so a leaked id was the whole identity. Demonstrated
 * in a bug bash: a client that knew only the id, and had never seen the room
 * code, was handed both.
 *
 * What separates a genuine return from someone else arriving with the same id is
 * the state of the socket the session is bound to. Reload, dropped network and
 * closed tab all leave it DISCONNECTED — that is every case the resume exists
 * for. A socket that is still connected is a player sitting in the room right
 * now, and handing their seat to a second client is not a reconnect however the
 * id got there.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
/** socket.io's live connection map, which the guard consults. */
const mockSockets = new Map();

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo, sockets: { sockets: mockSockets } },
    server: {},
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

const { addPlayerToRoom } = require('../utils/playerUtils');
const { offerResume } = require('../controllers/sessionController');
const { createEmptyBoard } = require('../domain/board');
const { SERVER_EVENTS } = require('../../shared/events');

const ROOM = 'r-sess';
const SESSION = 'session-abc';
const OWNER = 'sock-owner';
const OTHER = 'sock-other';

/** Puts a socket in io's live map, connected or not. */
const present = (id, connected) => mockSockets.set(id, { id, connected });

const seed = () => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'co-op',
        gameOver: 'false',
        gameWon: 'false',
        board: JSON.stringify(createEmptyBoard(2, 2)),
        numRows: '2', numCols: '2', numMines: '1',
        players: JSON.stringify([OWNER]),
    });
    mockRedis.seed(`player:${OWNER}`, { room: ROOM, name: 'Owner', score: '3', sessionId: SESSION });
    mockRedis.seed(`session:${SESSION}`, { room: ROOM, name: 'Owner', socketId: OWNER });
};

const fakeSocket = (id) => ({
    id,
    handshake: { auth: { sessionId: SESSION } },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
});

const sessionSocketId = () => mockRedis.read(`session:${SESSION}`).socketId;
const ownerStillExists = () => Object.keys(mockRedis.read(`player:${OWNER}`)).length > 0;

beforeEach(() => {
    mockRedis.flush();
    mockSockets.clear();
    jest.clearAllMocks();
    seed();
});

describe('someone else arriving with a live session id', () => {
    beforeEach(() => present(OWNER, true));   // the owner is sitting in the room

    test('is not offered the room, so the id discloses nothing', async () => {
        const thief = fakeSocket(OTHER);

        const offered = await offerResume(thief);

        expect(offered).toBe(false);
        expect(thief.emit).not.toHaveBeenCalledWith(SERVER_EVENTS.SESSION_RESUME, expect.anything());
    });

    test('does not evict the player who is holding it', async () => {
        await addPlayerToRoom(ROOM, OTHER, 'Thief', SESSION);

        expect(ownerStillExists()).toBe(true);
    });

    test('does not inherit the session either', async () => {
        await addPlayerToRoom(ROOM, OTHER, 'Thief', SESSION);

        expect(sessionSocketId()).toBe(OWNER);
    });

    test('still joins — as themselves', async () => {
        // Refusing the takeover must not refuse the person: the room is public
        // to anyone with the code, and they may simply have the same id by
        // accident. They just do not get to be the owner.
        await addPlayerToRoom(ROOM, OTHER, 'Thief', SESSION);

        expect(Object.keys(mockRedis.read(`player:${OTHER}`)).length).toBeGreaterThan(0);
    });
});

describe('the same browser coming back', () => {
    /* Every case this feature exists for leaves the old socket disconnected. */
    test('a reload resumes: the socket is gone, so the seat is handed over', async () => {
        present(OWNER, false);

        await addPlayerToRoom(ROOM, OTHER, 'Owner', SESSION);

        expect(sessionSocketId()).toBe(OTHER);
        expect(ownerStillExists()).toBe(false);
    });

    test('a socket this process never knew about is not treated as live', async () => {
        // After a restart io knows nobody, and every reconnect would otherwise
        // be refused as a takeover.
        await addPlayerToRoom(ROOM, OTHER, 'Owner', SESSION);

        expect(sessionSocketId()).toBe(OTHER);
    });

    test('the resume offer still arrives once the old socket has gone', async () => {
        present(OWNER, false);
        const returning = fakeSocket(OTHER);

        const offered = await offerResume(returning);

        expect(offered).toBe(true);
        expect(returning.emit).toHaveBeenCalledWith(
            SERVER_EVENTS.SESSION_RESUME,
            { room: ROOM, name: 'Owner' },
        );
    });

    test('reconnecting on the SAME socket id is never a takeover', async () => {
        present(OWNER, true);
        const same = fakeSocket(OWNER);

        expect(await offerResume(same)).toBe(true);
    });
});

describe('a session id that is not usable', () => {
    test('an over-long id is treated as no session at all', async () => {
        const socket = fakeSocket(OTHER);
        socket.handshake.auth.sessionId = 'x'.repeat(101);

        expect(await offerResume(socket)).toBe(false);
    });

    test('a non-string id does not reach Redis as a key', async () => {
        const socket = fakeSocket(OTHER);
        socket.handshake.auth.sessionId = { toString: () => SESSION };

        expect(await offerResume(socket)).toBe(false);
    });
});
