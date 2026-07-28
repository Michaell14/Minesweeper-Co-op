/**
 * Tests for server/data — the Redis key schema and the repositories.
 *
 * The keys matter more than they look: a mistyped field name is a SILENT no-op
 * (hGet returns null, hSet writes a field nobody reads), so these lock the exact
 * strings the production data already uses. Changing one is a data migration,
 * not a rename.
 */

const keys = require('../data/keys');
const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { redisClient } = require('../utils/initializeRedisClient');

let client;

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
});

describe('keys', () => {
    test('room and player keys match the deployed format', () => {
        expect(keys.roomKey('abc')).toBe('room:abc');
        expect(keys.playerKey('sock-1')).toBe('player:sock-1');
    });

    test('lock keys match the deployed format', () => {
        expect(keys.initLockKey('abc')).toBe('init_lock:abc');
        expect(keys.winnerLockKey('abc')).toBe('winner_lock:abc');
    });

    test('PVP fields are ONE-based while the player index is zero-based', () => {
        // Player index 0 reads and writes the player1* fields. Getting this
        // wrong would silently point a player at their opponent's board.
        expect(keys.pvpPlayerFields(0)).toEqual({
            boardKey: 'player1Board',
            initializedKey: 'player1Initialized',
            gameOverKey: 'player1GameOver',
            gameWonKey: 'player1GameWon',
            progressKey: 'player1Progress',
            socketKey: 'player1Socket',
        });
        expect(keys.pvpPlayerFields(1).boardKey).toBe('player2Board');
    });

    test('TTLs are 24h for data, 10s for locks and 10min for the room grace period', () => {
        expect(keys.ROOM_TTL_SECONDS).toBe(86400);
        expect(keys.PLAYER_TTL_SECONDS).toBe(86400);
        expect(keys.LOCK_TTL_SECONDS).toBe(10);
        expect(keys.ROOM_GRACE_PERIOD_SECONDS).toBe(600);
    });

    test('session keys match the deployed format', () => {
        expect(keys.sessionKey('abc')).toBe('session:abc');
    });
});

describe('roomRepo', () => {
    test('reads and writes go to the room hash', async () => {
        client.hGetAll.mockResolvedValue({ mode: 'pvp' });

        expect(await roomRepo.getState('r1')).toEqual({ mode: 'pvp' });
        expect(client.hGetAll).toHaveBeenCalledWith('room:r1');

        await roomRepo.setFields('r1', { gameOver: 'true' });
        expect(client.hSet).toHaveBeenCalledWith('room:r1', { gameOver: 'true' });
    });

    test('create writes the hash and starts the 24h expiry', async () => {
        await roomRepo.create('r1', { mode: 'co-op' });

        expect(client.hSet).toHaveBeenCalledWith('room:r1', { mode: 'co-op' });
        expect(client.expire).toHaveBeenCalledWith('room:r1', 86400);
    });

    test('getPlayers parses the JSON list', async () => {
        client.hGet.mockResolvedValue(JSON.stringify(['a', 'b']));

        expect(await roomRepo.getPlayers('r1')).toEqual(['a', 'b']);
        expect(client.hGet).toHaveBeenCalledWith('room:r1', 'players');
    });

    test.each([
        ['a missing field', undefined],
        ['an empty string', ''],
        ['malformed JSON', 'not json'],
        ['a non-array value', '{"a":1}'],
    ])('getPlayers returns [] for %s', async (_label, raw) => {
        client.hGet.mockResolvedValue(raw);

        expect(await roomRepo.getPlayers('r1')).toEqual([]);
    });

    test('opponentOf finds the other socket, or undefined when alone', async () => {
        client.hGet.mockResolvedValue(JSON.stringify(['a', 'b']));
        expect(await roomRepo.opponentOf('r1', 'a')).toBe('b');

        client.hGet.mockResolvedValue(JSON.stringify(['a']));
        expect(await roomRepo.opponentOf('r1', 'a')).toBeUndefined();
    });

    test('board round-trips through JSON', async () => {
        const board = [[{ isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 }]];
        await roomRepo.setBoard('r1', board);
        expect(client.hSet).toHaveBeenCalledWith('room:r1', { board: JSON.stringify(board) });

        client.hGet.mockResolvedValue(JSON.stringify(board));
        expect(await roomRepo.getBoard('r1')).toEqual(board);
    });

    test('getBoard returns null rather than throwing when unset', async () => {
        client.hGet.mockResolvedValue(undefined);

        expect(await roomRepo.getBoard('r1')).toBeNull();
    });

    test('PVP boards address the right per-player field', async () => {
        const board = [[{ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }]];

        await roomRepo.setPvpBoard('r1', 0, board);
        expect(client.hSet).toHaveBeenCalledWith('room:r1', { player1Board: JSON.stringify(board) });

        await roomRepo.setPvpBoard('r1', 1, board);
        expect(client.hSet).toHaveBeenCalledWith('room:r1', { player2Board: JSON.stringify(board) });
    });

    test('touch restores the full room lifetime, cancelling a grace period', async () => {
        await roomRepo.touch('r1');

        expect(client.expire).toHaveBeenCalledWith('room:r1', 86400);
    });

    test('startGracePeriod shortens the room rather than deleting it', async () => {
        await roomRepo.startGracePeriod('r1');

        expect(client.expire).toHaveBeenCalledWith('room:r1', 600);
        expect(client.del).not.toHaveBeenCalled();
    });

    test('locks use SET NX with a 10s expiry', async () => {
        await roomRepo.acquireInitLock('r1', 'sock-1');
        expect(client.set).toHaveBeenCalledWith('init_lock:r1', 'sock-1', { NX: true, EX: 10 });

        await roomRepo.acquireWinnerLock('r1', 'sock-1');
        expect(client.set).toHaveBeenCalledWith('winner_lock:r1', 'sock-1', { NX: true, EX: 10 });

        await roomRepo.releaseWinnerLock('r1');
        expect(client.del).toHaveBeenCalledWith('winner_lock:r1');
    });
});

describe('playerRepo', () => {
    test('reads and writes go to the player hash', async () => {
        client.hGetAll.mockResolvedValue({ name: 'Mike' });

        expect(await playerRepo.getState('sock-1')).toEqual({ name: 'Mike' });
        expect(client.hGetAll).toHaveBeenCalledWith('player:sock-1');
    });

    test('create seeds a zero score and starts the 24h expiry', async () => {
        await playerRepo.create('sock-1', { room: 'r1', name: 'Mike' });

        expect(client.hSet).toHaveBeenCalledWith('player:sock-1', { room: 'r1', name: 'Mike', score: '0', sessionId: '' });
        expect(client.expire).toHaveBeenCalledWith('player:sock-1', 86400);
    });

    test('create records the session id when one is supplied', async () => {
        await playerRepo.create('sock-1', { room: 'r1', name: 'Mike', sessionId: 'sess-9' });

        expect(client.hSet).toHaveBeenCalledWith('player:sock-1', expect.objectContaining({ sessionId: 'sess-9' }));
    });

    test('scores are stored as strings and read back as numbers', async () => {
        await playerRepo.setScore('sock-1', 12);
        expect(client.hSet).toHaveBeenCalledWith('player:sock-1', { score: '12' });

        client.hGet.mockResolvedValue('12');
        expect(await playerRepo.getScore('sock-1')).toBe(12);
    });

    test.each([
        ['an unset score', undefined],
        ['an empty string', ''],
        ['a non-numeric value', 'abc'],
    ])('getScore reads 0 for %s', async (_label, raw) => {
        client.hGet.mockResolvedValue(raw);

        expect(await playerRepo.getScore('sock-1')).toBe(0);
    });
});
