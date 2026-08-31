/**
 * A reload must not cost you your score.
 *
 * Player records are keyed by socket id, so a reconnect deletes the old record
 * and creates a new one. `addPlayerToRoom` carries everything else across that
 * seam — the room slot, the host role, the PVP board, the running clock — and
 * for a long time silently dropped the one number on screen: a co-op player who
 * refreshed came back sitting at 0 with the clock still running.
 *
 * On fakeRedis rather than the canned mock ON PURPOSE. The mock hands back
 * scripted values with no store behind them, so it cannot show whether a value
 * survived a delete followed by a create — which is the entire question here. A
 * green test there would have been no evidence at all.
 *
 * And the sequence below runs `removePlayer` FIRST, because that is what a
 * reload really does: the tab's socket drops, the disconnect handler deletes
 * the player record, and only then does the new socket rejoin. A test that
 * rejoins while the old record is still sitting there describes a world that
 * never happens — it passes against a fix that reads the score off a record
 * reality has already deleted, which is exactly how the first attempt at this
 * shipped green and did nothing.
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
        players: JSON.stringify([OLD]),
    });
    mockRedis.seed(`player:${OLD}`, { room: ROOM, name: 'Ana', score: '107', sessionId: SESSION });
    mockRedis.seed(`session:${SESSION}`, { room: ROOM, name: 'Ana', socketId: OLD });
};

const scoreOf = (socketId) => mockRedis.read(`player:${socketId}`).score;

/** The socket object removePlayer needs. */
const fakeSocket = (id) => ({ id, leave: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) });

/**
 * A reload, in the order the server really sees it: the old socket drops and is
 * cleaned up, then the new one joins carrying the same session id.
 */
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

        // What the room actually receives — a score restored on the record but
        // missing from the broadcast would still show as 0 on every screen.
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
 *
 * Both arrive at the same removePlayer and are indistinguishable there — what
 * separates them is that only a deliberate leave clears the session's room, and
 * a score is stashed only for a session that can still resume into the room it
 * was earned in. Without that a player could leave a room, walk back in, and
 * start on the score they left with.
 *
 * Through the real `playerLeave` route rather than its two halves by hand. The
 * route clears the session BEFORE removePlayer runs, and calling them in the
 * other order is what hid this: the stash was written after the clear that was
 * supposed to drop it, and the assertion below passed anyway.
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

        // Not just unread — a stash left behind would be taken by a join to
        // the same room from any later socket carrying this session.
        expect(mockRedis.read(`session:${SESSION}`).score).toBeUndefined();
    });
});

/*
 * Two tabs can hold the same session id — duplicating a tab copies
 * sessionStorage — and only one of them owns the session. The other joined as
 * itself, so its score is its own and must not be banked onto a session the
 * first tab is still going to resume with.
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
 * A score is restored ONCE.
 *
 * Co-op joins take no lock, so two tabs resuming the same session can both read
 * the stash before either consumes it. Read-then-return handed the same number
 * to both and doubled it across two player records; the delete has to be what
 * decides. On fakeRedis, whose every command yields, so the two really overlap.
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
 * The other half of the rule. The seat is only handed over when the previous
 * socket is GONE; a session id presented while its owner is still connected is
 * a takeover attempt, and must not become a way to inherit their score.
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
