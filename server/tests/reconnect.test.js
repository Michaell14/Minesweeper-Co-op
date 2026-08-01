/**
 * Tests for reconnect handling and the room grace period.
 *
 * Players are keyed by socket id, so a reload produces a brand new player. The
 * session id the browser keeps in sessionStorage is what lets the server tell
 * "same person, new socket" from "someone else joined", which matters most in
 * PVP where a ghost record reads as a third player.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const { addPlayerToRoom, removePlayer } = require('../utils/playerUtils');
const { redisClient } = require('../utils/initializeRedisClient');
const { createEmptyBoard } = require('../domain/board');

const ROOM = 'r1';
let client;

const roomState = (extra = {}) => ({
    mode: 'co-op',
    gameOver: 'false',
    gameWon: 'false',
    board: JSON.stringify(createEmptyBoard(2, 2)),
    numRows: '2',
    numCols: '2',
    players: JSON.stringify([]),
    ...extra,
});

/** Fields written to the room hash across all hSet calls. */
const roomWrites = () =>
    client.hSet.mock.calls.filter((c) => c[0] === `room:${ROOM}`).map((c) => c[1]);

const playersWritten = () => {
    const write = [...roomWrites()].reverse().find((w) => w.players);
    return write ? JSON.parse(write.players) : null;
};

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    client.hSet.mockResolvedValue(1);
    client.expire.mockResolvedValue(1);
    client.del.mockResolvedValue(1);
    client.exists.mockResolvedValue(0);
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:') ? roomState() : { name: 'Alice', score: '0' }
    );
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'players') return JSON.stringify([]);
        if (field === 'name') return 'Alice';
        if (field === 'score') return '0';
        if (field === 'socketId') return null; // no previous session by default
        return null;
    });
});

describe('joining with a session id', () => {
    test('records the session against the socket', async () => {
        await addPlayerToRoom(ROOM, 'sock-new', 'Alice', 'sess-1');

        expect(client.hSet).toHaveBeenCalledWith('session:sess-1', {
            room: ROOM,
            name: 'Alice',
            socketId: 'sock-new',
        });
        expect(client.expire).toHaveBeenCalledWith('session:sess-1', 86400);
    });

    test('cancels any grace period the room was counting down', async () => {
        await addPlayerToRoom(ROOM, 'sock-new', 'Alice', 'sess-1');

        expect(client.expire).toHaveBeenCalledWith(`room:${ROOM}`, 86400);
    });

    test('a first-time player is simply added', async () => {
        await addPlayerToRoom(ROOM, 'sock-new', 'Alice', 'sess-1');

        expect(playersWritten()).toEqual(['sock-new']);
    });

    test('works without a session id at all', async () => {
        await addPlayerToRoom(ROOM, 'sock-new', 'Alice', undefined);

        expect(playersWritten()).toEqual(['sock-new']);
        expect(client.hSet).not.toHaveBeenCalledWith(expect.stringContaining('session:'), expect.anything());
    });
});

describe('reconnecting under a new socket', () => {
    const asReconnect = (players = ['sock-old'], extra = {}) => {
        client.hGet.mockImplementation(async (key, field) => {
            if (field === 'socketId') return 'sock-old';
            if (field === 'players') return JSON.stringify(players);
            if (field === 'name') return 'Alice';
            if (field === 'score') return '0';
            return null;
        });
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? roomState({ players: JSON.stringify(players), ...extra }) : { name: 'Alice', score: '0' }
        );
    };

    test('drops the stale player record', async () => {
        asReconnect();

        await addPlayerToRoom(ROOM, 'sock-new', 'Alice', 'sess-1');

        expect(client.del).toHaveBeenCalledWith('player:sock-old');
    });

    test('takes the old slot instead of joining as an extra player', async () => {
        asReconnect(['sock-old', 'other']);

        await addPlayerToRoom(ROOM, 'sock-new', 'Alice', 'sess-1');

        // Same length: a PVP room would otherwise now look full to a third party
        expect(playersWritten()).toEqual(['sock-new', 'other']);
    });

    test('a reconnecting host keeps the host role', async () => {
        asReconnect(['sock-old'], { hostSocket: 'sock-old' });

        await addPlayerToRoom(ROOM, 'sock-new', 'Alice', 'sess-1');

        expect(client.hSet).toHaveBeenCalledWith(`room:${ROOM}`, { hostSocket: 'sock-new' });
    });

    test('a reconnecting non-host does not steal the host role', async () => {
        asReconnect(['sock-old', 'someone'], { hostSocket: 'someone' });

        await addPlayerToRoom(ROOM, 'sock-new', 'Alice', 'sess-1');

        expect(roomWrites().some((w) => w.hostSocket)).toBe(false);
    });

    test('the same socket reconnecting is not treated as a swap', async () => {
        client.hGet.mockImplementation(async (key, field) => {
            if (field === 'socketId') return 'sock-same'; // unchanged
            if (field === 'players') return JSON.stringify(['sock-same']);
            if (field === 'name') return 'Alice';
            if (field === 'score') return '0';
            return null;
        });
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? roomState({ players: JSON.stringify(['sock-same']) }) : { name: 'Alice', score: '0' }
        );

        await addPlayerToRoom(ROOM, 'sock-same', 'Alice', 'sess-1');

        expect(client.del).not.toHaveBeenCalledWith('player:sock-same');
    });
});

describe('the last player leaving', () => {
    const leaving = (players) => {
        client.exists.mockResolvedValue(1);
        client.hGet.mockImplementation(async (key, field) => {
            if (field === 'room') return ROOM;
            if (field === 'players') return JSON.stringify(players);
            if (field === 'name') return 'Alice';
            if (field === 'score') return '0';
            return null;
        });
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? roomState({ players: JSON.stringify(players) }) : { name: 'Alice', score: '0' }
        );
    };
    const socket = () => ({ leave: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) });

    test('keeps the room alive for the grace period instead of deleting it', async () => {
        leaving(['sock-1']);

        await removePlayer(socket(), 'sock-1');

        expect(client.expire).toHaveBeenCalledWith(`room:${ROOM}`, 600);
        expect(client.del).not.toHaveBeenCalledWith(`room:${ROOM}`);
    });

    test('still records that the room is now empty', async () => {
        leaving(['sock-1']);

        await removePlayer(socket(), 'sock-1');

        expect(playersWritten()).toEqual([]);
    });

    test('removes the player record either way', async () => {
        leaving(['sock-1']);

        await removePlayer(socket(), 'sock-1');

        expect(client.del).toHaveBeenCalledWith('player:sock-1');
    });

    test('a room with players left is not put on a grace period', async () => {
        leaving(['sock-1', 'sock-2']);

        await removePlayer(socket(), 'sock-1');

        expect(client.expire).not.toHaveBeenCalledWith(`room:${ROOM}`, 600);
        expect(playersWritten()).toEqual(['sock-2']);
    });
});

/**
 * Joining a room whose game has already ended.
 *
 * REGRESSION. These two catch the ARRIVAL up on an outcome they missed, but they
 * were sent to the whole room. Everyone already there watched it happen, so a
 * re-broadcast re-opens the end-of-game summary on their screen and fires the
 * confetti a second time. It was rare while it took a deliberate join of a
 * finished room — resume-on-reload turned it into "every time anyone refreshes".
 */
describe('catching up a player who joins a finished game', () => {
    const LATE = 'sock-late';

    /** Every socket id an event of this name was sent to. */
    const targetsOf = (event) =>
        mockTo.mock.calls
            .map((call, i) => ({ target: call[0], sent: mockEmit.mock.calls[i] }))
            .filter(({ sent }) => sent && sent[0] === event)
            .map(({ target }) => target);

    test('the loss is replayed to them, not to everyone', async () => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:')
                ? roomState({ gameOver: 'true', gameOverName: 'Alice' })
                : { name: 'Bob', score: '0' }
        );

        await addPlayerToRoom(ROOM, LATE, 'Bob', 'sess-late');

        expect(targetsOf('gameOver')).toEqual([LATE]);
        expect(targetsOf('gameOver')).not.toContain(ROOM);
    });

    test('the win is replayed to them, not to everyone', async () => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? roomState({ gameWon: 'true' }) : { name: 'Bob', score: '0' }
        );

        await addPlayerToRoom(ROOM, LATE, 'Bob', 'sess-late');

        expect(targetsOf('gameWon')).toEqual([LATE]);
        expect(targetsOf('gameWon')).not.toContain(ROOM);
    });
});
