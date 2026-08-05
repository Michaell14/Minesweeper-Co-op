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
const { lockedBy, releasedLock } = require('./setup/lockAssertions');

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
        expect(keys.actionLockKey('abc')).toBe('action_lock:abc');
    });

    test('the pvp action lock is keyed per PLAYER, and never collides with the co-op one', () => {
        expect(keys.pvpActionLockKey('abc', 0)).toBe('action_lock:abc:p0');
        expect(keys.pvpActionLockKey('abc', 1)).toBe('action_lock:abc:p1');
        // Two racers must never share a key, or PVP stops being a race.
        expect(keys.pvpActionLockKey('abc', 0)).not.toBe(keys.pvpActionLockKey('abc', 1));
        expect(keys.pvpActionLockKey('abc', 0)).not.toBe(keys.actionLockKey('abc'));
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

    test('the action lock leases for less than the others, since every move takes one', () => {
        // A process that dies holding it blocks the room for this long.
        expect(keys.ACTION_LOCK_TTL_SECONDS).toBe(5);
        expect(keys.ACTION_LOCK_TTL_SECONDS).toBeLessThan(keys.LOCK_TTL_SECONDS);
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

describe('withActionLock', () => {
    beforeEach(() => {
        client.set.mockResolvedValue('OK');
        client.eval.mockResolvedValue(1);
    });

    test('runs the move with the lock held and hands it back after', async () => {
        const order = [];
        client.set.mockImplementation(async () => { order.push('acquire'); return 'OK'; });
        client.eval.mockImplementation(async () => { order.push('release'); return 1; });

        const result = await roomRepo.withActionLock('r1', 'sock-1', async () => {
            order.push('move');
            return 'done';
        });

        expect(order).toEqual(['acquire', 'move', 'release']);
        expect(result).toBe('done');
        expect(client.set).toHaveBeenCalledWith('action_lock:r1', lockedBy('sock-1'), { NX: true, EX: 5 });
    });

    test('a contender waits for the lock instead of losing its move', async () => {
        // SET NX reports the lock as taken twice, then free — the shape of one
        // player clicking while another's move is still in flight.
        client.set
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('OK');
        const move = jest.fn(async () => 'ran');

        expect(await roomRepo.withActionLock('r1', 'sock-2', move)).toBe('ran');

        expect(move).toHaveBeenCalledTimes(1);
        expect(client.set).toHaveBeenCalledTimes(3);
    });

    test('releases the lock when the move throws, or the room wedges for a lease', async () => {
        await expect(
            roomRepo.withActionLock('r1', 'sock-1', async () => { throw new Error('boom'); })
        ).rejects.toThrow('boom');

        expect(releasedLock(client, 'action_lock:r1')).toBe(true);
    });

    test('does not release a lock it never held', async () => {
        // Otherwise a caller that gave up waiting would delete the key out
        // from under the player who actually holds it.
        jest.spyOn(Date, 'now')
            .mockReturnValueOnce(0)              // deadline is computed from this
            .mockReturnValue(Number.MAX_SAFE_INTEGER);
        client.set.mockResolvedValue(null);      // never free

        await expect(roomRepo.withActionLock('r1', 'sock-2', async () => 'ran anyway'))
            .rejects.toThrow(/never came free/);

        expect(client.eval).not.toHaveBeenCalled();
        Date.now.mockRestore();
    });

    /*
     * The lease is short — five seconds — because every move takes one and a
     * process that dies holding it blocks that board for the full lease. The
     * flip side is that a move CAN outlive it: once it expires the key is gone,
     * the next move acquires freely, and the first one's release then deletes a
     * lock it no longer holds, putting two moves inside the section at once.
     *
     * Which is also why the key does not hold the caller's socket id. On a PVP
     * or daily lock the key is per player, so the contention IS one socket's own
     * two moves, and an owner check on the socket alone could not tell them
     * apart.
     */
    describe('releasing a lock the lease already took away', () => {
        test('holds a value unique to this acquisition, not just the owner', async () => {
            await roomRepo.withActionLock('r1', 'sock-1', async () => 'a');
            await roomRepo.withActionLock('r1', 'sock-1', async () => 'b');

            const [first, second] = client.set.mock.calls.map(([, value]) => value);
            expect(first).toContain('sock-1');
            expect(second).toContain('sock-1');
            expect(first).not.toBe(second);
        });

        test('the release is conditional on still holding it', async () => {
            await roomRepo.withActionLock('r1', 'sock-1', async () => 'done');

            const [script, options] = client.eval.mock.calls[0];
            expect(script).toContain('redis.call("get", KEYS[1])');
            expect(options.keys).toEqual(['action_lock:r1']);
            // The token it acquired with, so a re-acquired key is left alone.
            expect(options.arguments[0]).toBe(client.set.mock.calls[0][1]);
        });
    });

    test('withPvpActionLock locks that player alone', async () => {
        await roomRepo.withPvpActionLock('r1', 1, 'sock-2', async () => 'ran');

        expect(client.set).toHaveBeenCalledWith('action_lock:r1:p1', lockedBy('sock-2'), { NX: true, EX: 5 });
        expect(releasedLock(client, 'action_lock:r1:p1')).toBe(true);
    });

    /*
     * This test used to assert the OPPOSITE — that an exhausted wait ran the
     * move anyway rather than dropping it. That was the wrong trade, and it was
     * measured: 203 daily cell opens fired together left 62 of them missing
     * from the stored board, because "run it anyway" means running exactly the
     * overlapping read-modify-write the lock exists to prevent. The lost writes
     * are not the refused move, they are whichever moves the racing writes
     * erase, and the attempt could then never be completed.
     *
     * A refused move leaves the board consistent and can be made again.
     */
    test('an exhausted wait refuses the move rather than running it unlocked', async () => {
        jest.spyOn(Date, 'now')
            .mockReturnValueOnce(0)
            .mockReturnValue(Number.MAX_SAFE_INTEGER);
        client.set.mockResolvedValue(null);
        const move = jest.fn(async () => 'ran');

        await expect(roomRepo.withActionLock('r1', 'sock-2', move))
            .rejects.toThrow(/never came free/);

        // The whole point: the board is never touched without the lock.
        expect(move).not.toHaveBeenCalled();
        Date.now.mockRestore();
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
