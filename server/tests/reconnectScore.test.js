/**
 * A reload must not cost you your score.
 *
 * Player records are keyed by socket id, so a reconnect deletes the old record
 * and creates a new one; `addPlayerToRoom` carries everything else across that
 * seam and for a long time dropped the score. On fakeRedis because the canned
 * mock has no store and cannot show whether a value survived a delete then a
 * create. `removePlayer` runs FIRST because that is what a reload really does:
 * a test that rejoins while the old record still exists passes against a fix
 * that reads a record reality has already deleted.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
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

const { addPlayerToRoom, removePlayer } = require('../utils/playerUtils');
const { leave } = require('../routes/room');
const { resetGame } = require('../utils/gameUtils');
const { createEmptyBoard } = require('../domain/board');

const ROOM = 'r-score';
const SESSION = 'session-score';
const OLD = 'sock-old';
const NEW = 'sock-new';

/** Puts a socket in io's live map, connected or not. */
const present = (id, connected) => mockSockets.set(id, { id, connected });

const seed = (mode = 'co-op') => {
    mockRedis.seed(`room:${ROOM}`, {
        mode,
        gameOver: 'false',
        gameWon: 'false',
        board: JSON.stringify(createEmptyBoard(2, 2)),
        numRows: '2', numCols: '2', numMines: '1',
        // A real run stamp: with both ends blank the run check would pass vacuously.
        startedAt: '1700000000000',
        players: JSON.stringify([OLD]),
    });
    mockRedis.seed(`player:${OLD}`, { room: ROOM, name: 'Ana', score: '107', sessionId: SESSION });
    mockRedis.seed(`session:${SESSION}`, { room: ROOM, name: 'Ana', socketId: OLD });
};

const scoreOf = (socketId) => mockRedis.read(`player:${socketId}`).score;

/** The socket object removePlayer needs. */
const fakeSocket = (id) => ({ id, leave: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) });

/** A reload in server order: old socket cleaned up, then the new one joins on the same session. */
const reload = async (name = 'Ana') => {
    await removePlayer(fakeSocket(OLD), OLD);
    await addPlayerToRoom(ROOM, NEW, name, SESSION);
};

beforeEach(() => {
    mockRedis.flush();
    mockSockets.clear();
    jest.clearAllMocks();
});

describe('reloading mid-game', () => {
    beforeEach(() => {
        seed();
        present(OLD, false);   // a reload leaves the previous socket disconnected
    });

    test('keeps the score the player earned', async () => {
        await reload();

        expect(scoreOf(NEW)).toBe('107');
    });

    test('puts that score on the scoreboard the room is sent', async () => {
        await reload();

        // A score restored on the record but missing from the broadcast would still show 0.
        const stats = mockEmit.mock.calls
            .map(([, payload]) => payload)
            .filter((payload) => Array.isArray(payload) && payload.some((p) => p && p.name === 'Ana'))
            .pop();

        expect(stats).toBeDefined();
        expect(stats.find((p) => p.name === 'Ana').score).toBe(107);
    });
});

describe('a PVP racer reloading', () => {
    test('keeps their score too', async () => {
        seed('pvp');
        present(OLD, false);

        await reload();

        expect(scoreOf(NEW)).toBe('107');
    });
});

/*
 * Leaving on purpose is not a reload, and must not bank a score for later.
 * Only a deliberate leave clears the session's room, and a score is stashed
 * only for a session that can still resume into that room. Through the real
 * `playerLeave` route: it clears the session BEFORE removePlayer runs, and
 * calling the halves in the other order hid this.
 */
describe('leaving a room on purpose', () => {
    beforeEach(() => {
        seed();
        present(OLD, false);
    });

    /** The socket the route is handed, session id and all. */
    const leaver = () => {
        const socket = fakeSocket(OLD);
        socket.handshake = { auth: { sessionId: SESSION } };
        return socket;
    };

    test('does not bank the score for the next join', async () => {
        await leave({ socket: leaver() });
        await addPlayerToRoom(ROOM, NEW, 'Ana', SESSION);

        expect(scoreOf(NEW)).toBe('0');
    });

    test('leaves nothing stashed on the session either', async () => {
        await leave({ socket: leaver() });

        // A stash left behind would be taken by any later socket carrying this session.
        expect(mockRedis.read(`session:${SESSION}`).score).toBeUndefined();
    });
});

/*
 * Two tabs can hold the same session id (duplicating a tab copies
 * sessionStorage) and only one owns it; the other's score must not be banked
 * onto a session the first tab will resume with.
 */
describe('a second tab sharing the session id', () => {
    test('does not stash its score onto the session it does not own', async () => {
        seed();
        present(OLD, true);           // the owner is still connected
        mockRedis.seed(`player:${NEW}`, { room: ROOM, name: 'Ana', score: '40', sessionId: SESSION });

        await removePlayer(fakeSocket(NEW), NEW);

        expect(mockRedis.read(`session:${SESSION}`).score).toBeUndefined();
    });
});

/*
 * A score is restored ONCE. Co-op joins take no lock, so two tabs resuming the
 * same session can both read the stash; the delete has to decide. On fakeRedis
 * so the two really overlap.
 */
describe('two sockets resuming the same session at once', () => {
    test('restores the score to exactly one of them', async () => {
        seed();
        present(OLD, false);
        await removePlayer(fakeSocket(OLD), OLD);

        await Promise.all([
            addPlayerToRoom(ROOM, NEW, 'Ana', SESSION),
            addPlayerToRoom(ROOM, 'sock-third', 'Ana', SESSION),
        ]);

        const restored = [scoreOf(NEW), scoreOf('sock-third')].map(Number).sort((a, b) => b - a);
        expect(restored).toEqual([107, 0]);
    });
});

/*
 * A score belongs to a GAME, not just a room. Reset zeroes everyone still
 * there and the next first click stamps a new run; a player who dropped out
 * at 107 meanwhile was not there to be zeroed, so the stash is pinned to the
 * run stamp. Through the real resetGame, since the field IT rewrites is what
 * has to line up.
 */
describe('rejoining a room that was reset while away', () => {
    beforeEach(() => {
        seed();
        present(OLD, false);
    });

    test('starts the new game at zero', async () => {
        await removePlayer(fakeSocket(OLD), OLD);
        await resetGame(ROOM);

        await addPlayerToRoom(ROOM, NEW, 'Ana', SESSION);

        expect(scoreOf(NEW)).toBe('0');
    });

    test('does not leave the stash behind for the run after that', async () => {
        await removePlayer(fakeSocket(OLD), OLD);
        await resetGame(ROOM);
        await addPlayerToRoom(ROOM, NEW, 'Ana', SESSION);

        // Left in place it would match again the moment this run's own startedAt was read.
        expect(mockRedis.read(`session:${SESSION}`).score).toBeUndefined();
    });
});

/*
 * The seat is only handed over when the previous socket is GONE; a session id
 * presented while its owner is connected is a takeover attempt, not a way to
 * inherit a score.
 */
describe('someone arriving with a live session id', () => {
    beforeEach(() => {
        seed();
        present(OLD, true);    // the owner is still sitting in the room
    });

    test('starts at zero rather than inheriting a score', async () => {
        await addPlayerToRoom(ROOM, NEW, 'Thief', SESSION);

        expect(scoreOf(NEW)).toBe('0');
    });

    test('leaves the original score where it was', async () => {
        await addPlayerToRoom(ROOM, NEW, 'Thief', SESSION);

        expect(scoreOf(OLD)).toBe('107');
    });
});
