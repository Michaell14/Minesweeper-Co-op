/**
 * Tests for server/data/dailyRepo.js and its keys.js builders.
 *
 * Same style as tests/repos.test.js: exact key-string assertions (a mistyped
 * key is a silent no-op, not an error) plus TTL and lock-shape checks.
 */

const keys = require('../data/keys');
const dailyRepo = require('../data/dailyRepo');
const { redisClient } = require('../utils/initializeRedisClient');

let client;

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
});

describe('daily keys', () => {
    test('key formats match the deployed schema', () => {
        expect(keys.dailyBoardKey('2026-07-30')).toBe('daily:2026-07-30:board');
        expect(keys.dailyLeaderboardKey('2026-07-30')).toBe('daily:2026-07-30:leaderboard');
        expect(keys.dailyAttemptKey('2026-07-30', 'tok-1')).toBe('daily:2026-07-30:attempt:tok-1');
        expect(keys.dailyGenLockKey('2026-07-30')).toBe('daily:2026-07-30:gen_lock');
        expect(keys.dailyStartLockKey('2026-07-30', 'tok-1')).toBe('daily:2026-07-30:start_lock:tok-1');
        expect(keys.dailyActionLockKey('2026-07-30', 'tok-1')).toBe('daily:2026-07-30:action_lock:tok-1');
    });

    test('daily data has its own 48h TTL, distinct from room/player TTLs', () => {
        expect(keys.DAILY_TTL_SECONDS).toBe(172800);
    });
});

describe('board template', () => {
    test('saveBoardState writes the hash and starts the TTL', async () => {
        const board = [[{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 0 }]];

        await dailyRepo.saveBoardState('2026-07-30', {
            board,
            seed: 12345,
            numRows: 16,
            numCols: 16,
            numMines: 48,
            openedCells: 9,
            startRow: 8,
            startCol: 8,
        });

        expect(client.hSet).toHaveBeenCalledWith('daily:2026-07-30:board', {
            board: JSON.stringify(board),
            seed: '12345',
            numRows: '16',
            numCols: '16',
            numMines: '48',
            openedCells: '9',
            startRow: '8',
            startCol: '8',
        });
        expect(client.expire).toHaveBeenCalledWith('daily:2026-07-30:board', 172800);
    });

    test('getBoardState reads the whole hash', async () => {
        client.hGetAll.mockResolvedValue({ seed: '12345' });

        expect(await dailyRepo.getBoardState('2026-07-30')).toEqual({ seed: '12345' });
        expect(client.hGetAll).toHaveBeenCalledWith('daily:2026-07-30:board');
    });
});

describe('attempts', () => {
    test('createAttempt seeds a ready attempt and starts the TTL', async () => {
        const board = [[{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 0 }]];

        await dailyRepo.createAttempt('2026-07-30', 'tok-1', { board, socketId: 'sock-1' });

        expect(client.hSet).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1', {
            status: 'ready',
            board: JSON.stringify(board),
            name: '',
            startedAt: '',
            finishedAt: '',
            elapsedMs: '',
            socketId: 'sock-1',
        });
        expect(client.expire).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1', 172800);
    });

    test('getAttempt reads the whole hash', async () => {
        client.hGetAll.mockResolvedValue({ status: 'in_progress' });

        expect(await dailyRepo.getAttempt('2026-07-30', 'tok-1')).toEqual({ status: 'in_progress' });
        expect(client.hGetAll).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1');
    });

    test('markStarted flips to in_progress and stamps startedAt', async () => {
        await dailyRepo.markStarted('2026-07-30', 'tok-1', 1000);

        expect(client.hSet).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1', {
            status: 'in_progress',
            startedAt: '1000',
        });
    });

    test('setAttemptBoard round-trips the board through JSON', async () => {
        const board = [[{ isMine: true, isOpen: true, isFlagged: false, nearbyMines: 0 }]];

        await dailyRepo.setAttemptBoard('2026-07-30', 'tok-1', board);

        expect(client.hSet).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1', {
            board: JSON.stringify(board),
        });
    });

    test('markFailed records the mine hit with no leaderboard write', async () => {
        await dailyRepo.markFailed('2026-07-30', 'tok-1', 5000, 4200);

        expect(client.hSet).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1', {
            status: 'failed',
            finishedAt: '5000',
            elapsedMs: '4200',
        });
        expect(client.zAdd).not.toHaveBeenCalled();
    });

    test('markWon records the clear as pending submission, no leaderboard write yet', async () => {
        await dailyRepo.markWon('2026-07-30', 'tok-1', 5000, 4200);

        expect(client.hSet).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1', {
            status: 'won_pending_submit',
            finishedAt: '5000',
            elapsedMs: '4200',
        });
        expect(client.zAdd).not.toHaveBeenCalled();
    });

    test('submitScore reads the server-stamped elapsedMs, never a caller-supplied one', async () => {
        client.hGet.mockResolvedValue('4200');

        const elapsedMs = await dailyRepo.submitScore('2026-07-30', 'tok-1', 'Alex');

        expect(client.hGet).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1', 'elapsedMs');
        expect(client.hSet).toHaveBeenCalledWith('daily:2026-07-30:attempt:tok-1', {
            name: 'Alex',
            status: 'completed',
        });
        expect(client.zAdd).toHaveBeenCalledWith('daily:2026-07-30:leaderboard', { score: 4200, value: 'tok-1' });
        expect(elapsedMs).toBe(4200);
    });
});

describe('leaderboard reads', () => {
    test('getLeaderboardTop batches names onto the ranked scores, fastest first', async () => {
        client.zRangeWithScores.mockResolvedValue([
            { value: 'tok-fast', score: 3000 },
            { value: 'tok-slow', score: 9000 },
        ]);
        client.hGet.mockImplementation((key) =>
            Promise.resolve(key.includes('tok-fast') ? 'Speedy' : 'Slowpoke')
        );

        const entries = await dailyRepo.getLeaderboardTop('2026-07-30', 50);

        expect(client.zRangeWithScores).toHaveBeenCalledWith('daily:2026-07-30:leaderboard', 0, 49);
        expect(entries).toEqual([
            { name: 'Speedy', elapsedMs: 3000, rank: 1 },
            { name: 'Slowpoke', elapsedMs: 9000, rank: 2 },
        ]);
    });

    test('getRank returns 1-based rank, or null when absent', async () => {
        client.zRank.mockResolvedValue(0);
        expect(await dailyRepo.getRank('2026-07-30', 'tok-1')).toBe(1);

        client.zRank.mockResolvedValue(null);
        expect(await dailyRepo.getRank('2026-07-30', 'tok-1')).toBeNull();
    });

    test('getEntryCount reads the ZSET cardinality', async () => {
        client.zCard.mockResolvedValue(42);

        expect(await dailyRepo.getEntryCount('2026-07-30')).toBe(42);
        expect(client.zCard).toHaveBeenCalledWith('daily:2026-07-30:leaderboard');
    });
});

describe('locks', () => {
    test('gen lock uses SET NX with the shared 10s lock TTL', async () => {
        await dailyRepo.acquireGenLock('2026-07-30', 'owner-1');
        expect(client.set).toHaveBeenCalledWith('daily:2026-07-30:gen_lock', 'owner-1', { NX: true, EX: 10 });

        await dailyRepo.releaseGenLock('2026-07-30');
        expect(client.del).toHaveBeenCalledWith('daily:2026-07-30:gen_lock');
    });

    test('start lock is scoped per token, keyed on itself as the owner', async () => {
        await dailyRepo.acquireStartLock('2026-07-30', 'tok-1');
        expect(client.set).toHaveBeenCalledWith('daily:2026-07-30:start_lock:tok-1', 'tok-1', { NX: true, EX: 10 });

        await dailyRepo.releaseStartLock('2026-07-30', 'tok-1');
        expect(client.del).toHaveBeenCalledWith('daily:2026-07-30:start_lock:tok-1');
    });

    test('the action lock is scoped per attempt, on the shorter move lease', async () => {
        const ran = await dailyRepo.withAttemptLock('2026-07-30', 'tok-1', 'sock-1', async () => 'ran');

        expect(ran).toBe('ran');
        expect(client.set).toHaveBeenCalledWith('daily:2026-07-30:action_lock:tok-1', 'sock-1', { NX: true, EX: 5 });
        expect(client.del).toHaveBeenCalledWith('daily:2026-07-30:action_lock:tok-1');
    });

    test('two attempts never share an action lock, so players do not wait on each other', () => {
        expect(keys.dailyActionLockKey('2026-07-30', 'tok-1'))
            .not.toBe(keys.dailyActionLockKey('2026-07-30', 'tok-2'));
        // ...and a move lock is not the start lock: an in-flight move must not
        // be mistaken for a start, or either could free the other's key.
        expect(keys.dailyActionLockKey('2026-07-30', 'tok-1'))
            .not.toBe(keys.dailyStartLockKey('2026-07-30', 'tok-1'));
    });

    test('releases the attempt lock even when the move throws', async () => {
        await expect(
            dailyRepo.withAttemptLock('2026-07-30', 'tok-1', 'sock-1', async () => { throw new Error('boom'); })
        ).rejects.toThrow('boom');

        expect(client.del).toHaveBeenCalledWith('daily:2026-07-30:action_lock:tok-1');
    });
});
