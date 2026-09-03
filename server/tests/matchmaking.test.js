/**
 * Quick match: pairing two waiting sockets into a PVP room.
 *
 * Driven against `tests/setup/fakeRedis.js`, as `coopConcurrency.test.js` is:
 * the match lock only matters when two searches OVERLAP, and the shared mock
 * settles in call order. Unlocked, two players arriving together each read an
 * empty queue, each sit down in it, and both wait for a third.
 */

// `mock`-prefixed: jest hoists the factories and only allows that prefix inside one.
const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

/** Live sockets, keyed by id — socket.io's own map, which matchmaking reads. */
const mockConnected = new Map();
/** Everything sent to a socket, by id: both `socket.emit` and `io.to(id).emit`. */
let mockEmitted = {};

const record = (id, event, payload) => {
    (mockEmitted[id] ||= []).push({ event, payload });
};

jest.mock('../utils/initializeRedisClient', () => ({ redisClient: Promise.resolve(mockRedis) }));

jest.mock('../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    io: {
        use: jest.fn(),
        // socket.io's live map; both "still here" and "how many" read it, so no second tally can lag.
        sockets: { sockets: mockConnected },
        to: (target) => ({ emit: (event, payload) => record(target, event, payload) }),
    },
    server: { listen: jest.fn() },
}));

const mockFailAddFor = { socketId: null };
jest.mock('../utils/playerUtils', () => {
    const actual = jest.requireActual('../utils/playerUtils');
    return {
        ...actual,
        addPlayerToRoom: (room, socketId, ...rest) => {
            if (socketId === mockFailAddFor.socketId) throw new Error('add failed');
            return actual.addPlayerToRoom(room, socketId, ...rest);
        },
    };
});

const {
    findMatch,
    cancelMatch,
    startPracticeRace,
    leaveQueue,
    broadcastOnlineCount,
} = require('../controllers/matchmakingController');
const matchRepo = require('../data/matchRepo');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { SERVER_EVENTS } = require('../../shared/events');
const { DEFAULT_PRESET } = require('../../shared/boardConfig');

/** A socket.io socket, reduced to what matchmaking and its callees touch. */
const makeSocket = (id, { connect = true } = {}) => {
    const socket = {
        id,
        handshake: { auth: { sessionId: `session-${id}` } },
        rooms: new Set(),
        join: (room) => socket.rooms.add(room),
        leave: (room) => socket.rooms.delete(room),
        emit: (event, payload) => record(id, event, payload),
    };
    if (connect) mockConnected.set(id, socket);
    return socket;
};

const eventsFor = (id) => (mockEmitted[id] || []).map((e) => e.event);
const payloadOf = (id, event) => (mockEmitted[id] || []).find((e) => e.event === event)?.payload;
/** The most recent of a repeated event — the online count is sent many times. */
const lastPayloadOf = (id, event) =>
    (mockEmitted[id] || []).filter((e) => e.event === event).at(-1)?.payload;

/** A socket going away: socket.io drops it from the map before `disconnect`. */
const disconnectSocket = (id) => mockConnected.delete(id);

beforeEach(() => {
    mockRedis.flush();
    mockConnected.clear();
    mockEmitted = {};
    mockFailAddFor.socketId = null;
});

describe('a single searcher', () => {
    test('is queued and told the search is running', async () => {
        const alice = makeSocket('alice');

        await findMatch({ socket: alice, name: 'Alice' });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_SEARCHING]);
        const waiting = await matchRepo.listWaiting();
        expect(waiting.map((w) => w.socketId)).toEqual(['alice']);
        expect(waiting[0].name).toBe('Alice');
    });

    test('clicking twice takes one place in line, not two', async () => {
        const alice = makeSocket('alice');

        await findMatch({ socket: alice, name: 'Alice' });
        await findMatch({ socket: alice, name: 'Alice' });

        // Never paired with themselves, and still exactly one entry.
        const waiting = await matchRepo.listWaiting();
        expect(waiting.map((w) => w.socketId)).toEqual(['alice']);
    });

    test('a name of nothing but spaces is refused, like every other name', async () => {
        const alice = makeSocket('alice');

        await findMatch({ socket: alice, name: '   ' });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_ERROR]);
        expect(await matchRepo.listWaiting()).toEqual([]);
    });

    test('is refused while already in a room', async () => {
        const alice = makeSocket('alice');
        await playerRepo.create('alice', { room: 'SOMEWHERE', name: 'Alice', sessionId: 's' });

        await findMatch({ socket: alice, name: 'Alice' });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_ERROR]);
        expect(await matchRepo.listWaiting()).toEqual([]);
    });
});

describe('two searchers', () => {
    test('are paired into one PVP room, the waiting player hosting', async () => {
        const alice = makeSocket('alice');
        const bob = makeSocket('bob');

        await findMatch({ socket: alice, name: 'Alice' });
        await findMatch({ socket: bob, name: 'Bob' });

        const aliceJoin = payloadOf('alice', SERVER_EVENTS.JOIN_ROOM_SUCCESS);
        const bobJoin = payloadOf('bob', SERVER_EVENTS.JOIN_ROOM_SUCCESS);

        expect(aliceJoin.room).toBe(bobJoin.room);
        expect(aliceJoin.mode).toBe('pvp');
        // Never a practice room: a racer would get a target bar over a live opponent.
        expect(aliceJoin.practice).toBeUndefined();
        expect(bobJoin.practice).toBeUndefined();
        // Alice waited, so Alice presses Start.
        expect(aliceJoin.isHost).toBe(true);
        expect(bobJoin.isHost).toBe(false);

        // The dimensions travel, or the joiner's flag counter has nothing to size from.
        expect(aliceJoin.numRows).toBe(DEFAULT_PRESET.rows);
        expect(bobJoin.numMines).toBe(DEFAULT_PRESET.mines);

        const players = await roomRepo.getPlayers(aliceJoin.room);
        expect(players.sort()).toEqual(['alice', 'bob']);
        expect(await roomRepo.getField(aliceJoin.room, 'hostSocket')).toBe('alice');
        expect(await roomRepo.getField(aliceJoin.room, 'mode')).toBe('pvp');

        // Both sockets are in the room, or nothing broadcast to it reaches them.
        expect(alice.rooms.has(aliceJoin.room)).toBe(true);
        expect(bob.rooms.has(aliceJoin.room)).toBe(true);

        // The lobby, announced as a hand-made PVP room announces it; anonymous, so no avatar.
        expect(payloadOf('alice', SERVER_EVENTS.PVP_ROOM_READY)).toEqual({ opponentName: 'Bob', opponentAvatar: null, isHost: true });
        expect(payloadOf('bob', SERVER_EVENTS.PVP_ROOM_READY)).toEqual({ opponentName: 'Alice', opponentAvatar: null, isHost: false });

        // Nobody is left waiting.
        expect(await matchRepo.listWaiting()).toEqual([]);
    });

    test('arriving at the SAME moment still produce exactly one pairing', async () => {
        const alice = makeSocket('alice');
        const bob = makeSocket('bob');

        // The bug this guards: both read an empty queue, both enqueue, each waits.
        await Promise.all([
            findMatch({ socket: alice, name: 'Alice' }),
            findMatch({ socket: bob, name: 'Bob' }),
        ]);

        const rooms = ['alice', 'bob'].map((id) => payloadOf(id, SERVER_EVENTS.JOIN_ROOM_SUCCESS)?.room);
        expect(rooms[0]).toBeDefined();
        expect(rooms[0]).toBe(rooms[1]);
        expect(await matchRepo.listWaiting()).toEqual([]);

        const hosts = ['alice', 'bob'].filter((id) => payloadOf(id, SERVER_EVENTS.JOIN_ROOM_SUCCESS).isHost);
        expect(hosts).toHaveLength(1);
    });

    test('a third simultaneous searcher waits rather than joining the pair', async () => {
        const sockets = ['alice', 'bob', 'carol'].map((id) => makeSocket(id));

        await Promise.all(
            sockets.map((socket) => findMatch({ socket, name: socket.id })),
        );

        const paired = sockets.filter((s) => payloadOf(s.id, SERVER_EVENTS.JOIN_ROOM_SUCCESS));
        expect(paired).toHaveLength(2);

        const room = payloadOf(paired[0].id, SERVER_EVENTS.JOIN_ROOM_SUCCESS).room;
        expect((await roomRepo.getPlayers(room)).sort()).toEqual(paired.map((s) => s.id).sort());

        const waiting = await matchRepo.listWaiting();
        expect(waiting).toHaveLength(1);
        expect(paired.map((s) => s.id)).not.toContain(waiting[0].socketId);
    });

    test('the longest waiter is taken first', async () => {
        makeSocket('alice');
        makeSocket('bob');
        const carol = makeSocket('carol');

        // Seeded, since a second searcher would pair rather than queue. Bob is
        // written FIRST but queued LATER, so hash order and wait time disagree.
        const now = Date.now();
        await matchRepo.enqueue('bob', { name: 'Bob', sessionId: '', queuedAt: now - 1000 });
        await matchRepo.enqueue('alice', { name: 'Alice', sessionId: '', queuedAt: now - 5000 });

        await findMatch({ socket: carol, name: 'Carol' });

        expect(payloadOf('carol', SERVER_EVENTS.PVP_ROOM_READY).opponentName).toBe('Alice');
        expect((await matchRepo.listWaiting()).map((w) => w.socketId)).toEqual(['bob']);
    });
});

describe('entries that have gone bad', () => {
    test('a socket that dropped is pruned rather than paired with', async () => {
        const ghost = makeSocket('ghost');
        await findMatch({ socket: ghost, name: 'Ghost' });

        // They went away without their disconnect cleanup running.
        mockConnected.delete('ghost');

        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });

        // Alice waits rather than being paired into a room with nobody in it.
        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_SEARCHING]);
        expect((await matchRepo.listWaiting()).map((w) => w.socketId)).toEqual(['alice']);
    });

    test('someone who joined a room while queued is pruned rather than dragged out of it', async () => {
        const bob = makeSocket('bob');
        await findMatch({ socket: bob, name: 'Bob' });

        // A second tab, say: a player record IS being in a room.
        await playerRepo.create('bob', { room: 'ELSEWHERE', name: 'Bob', sessionId: 's' });

        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_SEARCHING]);
        expect((await matchRepo.listWaiting()).map((w) => w.socketId)).toEqual(['alice']);
    });

    test('an entry too old to trust is pruned', async () => {
        const stale = makeSocket('stale');
        await matchRepo.enqueue('stale', { name: 'Stale', sessionId: '', queuedAt: 1 });
        expect(mockConnected.has('stale')).toBe(true); // still connected, but ancient

        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_SEARCHING]);
        expect((await matchRepo.listWaiting()).map((w) => w.socketId)).toEqual(['alice']);
    });

    test('an unreadable entry is pruned rather than left to sit', async () => {
        const client = await require('../utils/initializeRedisClient').redisClient;
        await client.hSet('matchmaking:queue', { junk: 'not json' });

        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });

        expect((await matchRepo.listWaiting()).map((w) => w.socketId)).toEqual(['alice']);
    });
});

describe('what a waiting player is told', () => {
    test('the count is who is ONLINE, not who is queued', async () => {
        // Queue depth would always be zero here: reaching matchSearching means
        // nobody was pairable. Two idle sockets are what the number describes.
        makeSocket('idle-one');
        makeSocket('idle-two');
        const alice = makeSocket('alice');

        await findMatch({ socket: alice, name: 'Alice' });

        expect(payloadOf('alice', SERVER_EVENTS.MATCH_SEARCHING)).toEqual({ othersOnline: 2 });
    });

    test('a lone player is told they are alone', async () => {
        const alice = makeSocket('alice');

        await findMatch({ socket: alice, name: 'Alice' });

        expect(payloadOf('alice', SERVER_EVENTS.MATCH_SEARCHING)).toEqual({ othersOnline: 0 });
    });
});

/** Sent once, the count is wrong for as long as the player waits. */
describe('the online count while the search runs', () => {
    test('follows people arriving', async () => {
        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });
        expect(payloadOf('alice', SERVER_EVENTS.MATCH_SEARCHING)).toEqual({ othersOnline: 0 });

        makeSocket('idle-one');
        await broadcastOnlineCount();
        makeSocket('idle-two');
        await broadcastOnlineCount();

        expect(lastPayloadOf('alice', SERVER_EVENTS.MATCH_ONLINE_COUNT)).toEqual({ othersOnline: 2 });
    });

    test('follows people leaving', async () => {
        makeSocket('idle-one');
        makeSocket('idle-two');
        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });

        disconnectSocket('idle-one');
        await broadcastOnlineCount();

        expect(lastPayloadOf('alice', SERVER_EVENTS.MATCH_ONLINE_COUNT)).toEqual({ othersOnline: 1 });
    });

    test('never counts the waiting player as one of the others', async () => {
        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });

        await broadcastOnlineCount();

        expect(lastPayloadOf('alice', SERVER_EVENTS.MATCH_ONLINE_COUNT)).toEqual({ othersOnline: 0 });
    });

    test('does not re-assert the search itself', async () => {
        // A cancel and a broadcast can cross; a second `matchSearching` would
        // put the client back into a search it had just left.
        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });
        await cancelMatch({ socket: alice });

        makeSocket('idle-one');
        await broadcastOnlineCount();

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_SEARCHING, SERVER_EVENTS.MATCH_CANCELLED]);
    });

    test('goes to nobody when nobody is waiting', async () => {
        makeSocket('idle-one');
        makeSocket('idle-two');

        await broadcastOnlineCount();

        expect(eventsFor('idle-one')).toEqual([]);
        expect(eventsFor('idle-two')).toEqual([]);
    });

    test('skips a queue entry whose socket is already gone', async () => {
        // A dyno restart leaves entries behind; this path never writes, so it just skips them.
        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });
        disconnectSocket('alice');

        await broadcastOnlineCount();

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_SEARCHING]);
    });
});

describe('the practice race', () => {
    test('opens a CO-OP room holding just the one player', async () => {
        const alice = makeSocket('alice');

        await startPracticeRace({ socket: alice, name: 'Alice' });

        const joined = payloadOf('alice', SERVER_EVENTS.JOIN_ROOM_SUCCESS);
        expect(joined.mode).toBe('co-op');
        expect(joined.numRows).toBe(DEFAULT_PRESET.rows);
        expect(joined.numMines).toBe(DEFAULT_PRESET.mines);
        // The label the client reads to decide whether to draw a target; on the ANSWER, not the room.
        expect(joined.practice).toBe(true);

        // A co-op room of one: generation, clock and win check need no practice-specific code.
        expect(await roomRepo.getPlayers(joined.room)).toEqual(['alice']);
        expect(await roomRepo.getField(joined.room, 'mode')).toBe('co-op');
        expect(alice.rooms.has(joined.room)).toBe(true);

        // The room records only HOW it was opened. The target never reaches the
        // server; if it did, something server-side would be simulating an opponent.
        const state = await roomRepo.getState(joined.room);
        expect(state.practice).toBe('true');
        expect(Object.keys(state).some((k) => /target|opponent/i.test(k))).toBe(false);
    });

    test('leaves the queue, so a partner cannot arrive into an abandoned search', async () => {
        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });
        expect((await matchRepo.listWaiting()).map((w) => w.socketId)).toEqual(['alice']);

        await startPracticeRace({ socket: alice, name: 'Alice' });

        expect(await matchRepo.listWaiting()).toEqual([]);
    });

    test('does not collide with a quick-match room', async () => {
        const alice = makeSocket('alice');
        const bob = makeSocket('bob');
        await findMatch({ socket: alice, name: 'Alice' });
        await findMatch({ socket: bob, name: 'Bob' });
        const matchRoom = payloadOf('alice', SERVER_EVENTS.JOIN_ROOM_SUCCESS).room;

        const carol = makeSocket('carol');
        await startPracticeRace({ socket: carol, name: 'Carol' });
        const soloRoom = payloadOf('carol', SERVER_EVENTS.JOIN_ROOM_SUCCESS).room;

        expect(soloRoom).not.toBe(matchRoom);
    });

    test('is refused while already in a room', async () => {
        const alice = makeSocket('alice');
        await playerRepo.create('alice', { room: 'SOMEWHERE', name: 'Alice', sessionId: 's' });

        await startPracticeRace({ socket: alice, name: 'Alice' });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_ERROR]);
    });

    test('a name of nothing but spaces is refused, like every other name', async () => {
        const alice = makeSocket('alice');

        await startPracticeRace({ socket: alice, name: '   ' });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_ERROR]);
    });
});

describe('leaving the queue', () => {
    test('cancel removes the entry and answers the waiting client', async () => {
        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });

        await cancelMatch({ socket: alice });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_SEARCHING, SERVER_EVENTS.MATCH_CANCELLED]);
        expect(await matchRepo.listWaiting()).toEqual([]);
    });

    test('cancelling without having searched still answers, so no client can hang', async () => {
        const alice = makeSocket('alice');

        await cancelMatch({ socket: alice });

        expect(eventsFor('alice')).toEqual([SERVER_EVENTS.MATCH_CANCELLED]);
    });

    test('a disconnect leaves the queue silently', async () => {
        const alice = makeSocket('alice');
        await findMatch({ socket: alice, name: 'Alice' });
        mockEmitted = {};

        await leaveQueue(alice);

        expect(await matchRepo.listWaiting()).toEqual([]);
        // Nobody left to tell — a stray emit here would be a write to a dead socket.
        expect(eventsFor('alice')).toEqual([]);
    });
});

describe('a match that fails half-built', () => {
    test('leaves no player records, so the re-enqueued host is pairable again', async () => {
        const alice = makeSocket('sock-alice');
        await findMatch({ socket: alice, name: 'Alice' });

        // Host (Alice) is added first and succeeds; the guest's add throws.
        mockFailAddFor.socketId = 'sock-bob';
        const bob = makeSocket('sock-bob');
        await findMatch({ socket: bob, name: 'Bob' });

        expect(eventsFor('sock-bob')).toContain(SERVER_EVENTS.MATCH_ERROR);
        expect(await playerRepo.exists('sock-alice')).toBeFalsy();
        expect(await playerRepo.exists('sock-bob')).toBeFalsy();

        mockFailAddFor.socketId = null;
        const carol = makeSocket('sock-carol');
        await findMatch({ socket: carol, name: 'Carol' });

        expect(eventsFor('sock-carol')).toContain(SERVER_EVENTS.JOIN_ROOM_SUCCESS);
        expect(eventsFor('sock-alice')).toContain(SERVER_EVENTS.JOIN_ROOM_SUCCESS);
    });
});
