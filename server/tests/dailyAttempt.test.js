/**
 * Handler-level tests for the daily lifecycle: dailyController.js
 * (start/submit/leaderboard) and game/daily.js (open/chord/flag, timing).
 * Uses an in-memory Redis fake because these flows read back what they wrote.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockJoin = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

/**
 * One stable object, reset in place: dailyRepo.js destructures `redisClient`
 * once at require time, so a fresh mock per test would never reach it.
 */
const createFakeRedis = () => {
    const hashes = new Map();
    const strings = new Map();
    const zsets = new Map();

    return {
        __reset: () => {
            hashes.clear();
            strings.clear();
            zsets.clear();
        },
        hGetAll: jest.fn(async (key) => ({ ...(hashes.get(key) || {}) })),
        hGet: jest.fn(async (key, field) => {
            const value = (hashes.get(key) || {})[field];
            return value === undefined ? null : value;
        }),
        hmGet: jest.fn(async (key, fields) => {
            const hash = hashes.get(key) || {};
            return fields.map((field) => (hash[field] === undefined ? null : hash[field]));
        }),
        hSet: jest.fn(async (key, fields) => {
            const h = hashes.get(key) || {};
            Object.assign(h, fields);
            hashes.set(key, h);
            return Object.keys(fields).length;
        }),
        exists: jest.fn(async (key) => (hashes.has(key) ? 1 : 0)),
        del: jest.fn(async (key) => {
            strings.delete(key);
            hashes.delete(key);
            return 1;
        }),
        set: jest.fn(async (key, value, opts) => {
            if (opts && opts.NX && strings.has(key)) return null;
            strings.set(key, value);
            return 'OK';
        }),
        // withLock's ownership-checked release, the one script the server runs.
        eval: jest.fn(async (_script, { keys, arguments: args }) => {
            if (strings.get(keys[0]) !== args[0]) return 0;
            strings.delete(keys[0]);
            return 1;
        }),
        expire: jest.fn(async () => 1),
        zAdd: jest.fn(async (key, { score, value }) => {
            const z = zsets.get(key) || new Map();
            z.set(value, score);
            zsets.set(key, z);
            return 1;
        }),
        zRangeWithScores: jest.fn(async (key, start, stop) => {
            const z = zsets.get(key) || new Map();
            const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]);
            const end = stop === -1 ? sorted.length : stop + 1;
            return sorted.slice(start, end).map(([value, score]) => ({ value, score }));
        }),
        zRank: jest.fn(async (key, member) => {
            const z = zsets.get(key) || new Map();
            const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]);
            const idx = sorted.findIndex(([value]) => value === member);
            return idx === -1 ? null : idx;
        }),
        zCard: jest.fn(async (key) => (zsets.get(key) || new Map()).size),
        ping: jest.fn(),
    };
};

const mockRedisSingleton = createFakeRedis();
jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedisSingleton),
}));

// Only recordForSockets is faked (without a DB it no-ops, hiding what
// finishAttempt sent); boardKeyOf stays real since daily.js builds the payload with it.
const mockRecordForSockets = jest.fn();
jest.mock('../utils/statsRecorder', () => ({
    ...jest.requireActual('../utils/statsRecorder'),
    recordForSockets: (...args) => mockRecordForSockets(...args),
}));

const dailyRepo = require('../data/dailyRepo');
const dailyGame = require('../game/daily');
const { startDaily, submitDailyScore, getDailyLeaderboard } = require('../controllers/dailyController');

const DATE = '2026-07-30';

/**
 * 3x2, one mine at [0][1]; [0][0] and [1][0] pre-opened like a real daily's
 * fixed-center opening. Three closed safe cells, so one open starts the clock
 * without winning. nearbyMines is never 0, so no cascade fires and every open
 * touches exactly one cell.
 */
const tinyBoard = () => [
    [
        { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
        { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 },
    ],
    [
        { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
        { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 },
    ],
    [
        { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 },
        { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 },
    ],
];

const seedTinyBoard = async () => {
    await dailyRepo.saveBoardState(DATE, {
        board: tinyBoard(),
        seed: 1,
        numRows: 3,
        numCols: 2,
        numMines: 1,
        openedCells: 2,
        startRow: 0,
        startCol: 0,
    });
};

const emittedFor = (event) => mockEmit.mock.calls.filter((c) => c[0] === event).map((c) => c[1]);
const lastEmitted = (event) => emittedFor(event).at(-1);

const socketFor = (id) => ({ id, emit: jest.fn(), join: jest.fn() });

/**
 * Noon UTC on DATE. Tests advance by small offsets (BASE_TIME + N), never an
 * unrelated epoch: todayUtc() reads the same Date.now() and would land on a
 * different calendar day than the one seeded here.
 */
const BASE_TIME = Date.parse('2026-07-30T12:00:00.000Z');
let nowSpy;

beforeEach(async () => {
    mockRedisSingleton.__reset();
    Object.values(mockRedisSingleton).forEach((fn) => fn.mockClear && fn.mockClear());
    mockEmit.mockClear();
    mockTo.mockClear();
    mockJoin.mockClear();
    mockRecordForSockets.mockClear();
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(BASE_TIME);
    await seedTinyBoard();
});

afterEach(() => {
    nowSpy.mockRestore();
});

describe('startDaily', () => {
    test('a fresh token creates a ready attempt with no startedAt yet', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        expect(socket.emit).toHaveBeenCalledWith(
            'dailyStarted',
            expect.objectContaining({ date: DATE, startedAt: null })
        );

        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(attempt.status).toBe('ready');
        expect(attempt.startedAt).toBe('');
    });

    test('two different tokens each get their own independent attempt', async () => {
        const socketA = socketFor('sock-a');
        const socketB = socketFor('sock-b');

        await startDaily({ socket: socketA, dailyAttemptToken: 'tok-a' });
        await startDaily({ socket: socketB, dailyAttemptToken: 'tok-b' });

        await dailyGame.openCell(DATE, 'tok-a', 'sock-a', 0, 1); // hits the mine

        const attemptA = await dailyRepo.getAttempt(DATE, 'tok-a');
        const attemptB = await dailyRepo.getAttempt(DATE, 'tok-b');
        expect(attemptA.status).toBe('failed');
        expect(attemptB.status).toBe('ready'); // untouched by A's mine hit
    });

    test('two near-simultaneous starts for the SAME fresh token create only one attempt', async () => {
        // Two tabs of one browser share the token (lib/dailyIdentity.ts); the
        // start lock in dailyController.js serialises them.
        const createAttemptSpy = jest.spyOn(dailyRepo, 'createAttempt');
        const socketA = socketFor('sock-a');
        const socketB = socketFor('sock-b');

        await Promise.all([
            startDaily({ socket: socketA, dailyAttemptToken: 'tok-shared' }),
            startDaily({ socket: socketB, dailyAttemptToken: 'tok-shared' }),
        ]);

        expect(createAttemptSpy).toHaveBeenCalledTimes(1);

        // The loser reads back what the winner wrote rather than getting nothing.
        expect(socketA.emit).toHaveBeenCalledWith('dailyStarted', expect.objectContaining({ date: DATE }));
        expect(socketB.emit).toHaveBeenCalledWith('dailyStarted', expect.objectContaining({ date: DATE }));

        createAttemptSpy.mockRestore();
    });

    test('resuming an in_progress attempt returns the ORIGINAL startedAt, not a fresh one', async () => {
        const socket = socketFor('sock-1');

        nowSpy.mockReturnValue(BASE_TIME + 1_000);
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // safe cell, starts the clock

        nowSpy.mockReturnValue(BASE_TIME + 9_000); // time passes, then the player refreshes
        socket.emit.mockClear();
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        expect(socket.emit).toHaveBeenCalledWith(
            'dailyStarted',
            expect.objectContaining({ startedAt: BASE_TIME + 1_000 })
        );
    });

    test('a terminal attempt is rejected with dailyAlreadyAttempted, not a fresh board', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 0, 1); // hits the mine -> failed

        socket.emit.mockClear();
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        expect(socket.emit).toHaveBeenCalledWith(
            'dailyAlreadyAttempted',
            expect.objectContaining({ status: 'failed' })
        );
        expect(socket.emit).not.toHaveBeenCalledWith('dailyStarted', expect.anything());
    });

    test('resuming a completed attempt reports rank and totalEntries -- for the share-result text', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // safe
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 0); // safe
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 1); // last safe cell -> win

        await submitDailyScore({ socket, io: { to: mockTo }, dailyAttemptToken: 'tok-1', date: DATE, name: 'Alex' });

        socket.emit.mockClear();
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        expect(socket.emit).toHaveBeenCalledWith(
            'dailyAlreadyAttempted',
            expect.objectContaining({ status: 'completed', rank: 1, totalEntries: 1 })
        );
        expect(socket.emit).not.toHaveBeenCalledWith('dailyStarted', expect.anything());
    });

    test('a resumed FAILED attempt carries its final board, mines revealed, for a view-only replay', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 0, 1); // hits the mine -> failed

        socket.emit.mockClear();
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        const [, payload] = socket.emit.mock.calls.find(([event]) => event === 'dailyAlreadyAttempted');
        expect(Array.isArray(payload.board)).toBe(true);
        expect(payload.board).toHaveLength(payload.numRows);
        expect(payload.board[0]).toHaveLength(payload.numCols);
        // Terminal state: mines must show, or the replay explains nothing.
        const minesShown = payload.board.flat().filter((cell) => cell.isMine).length;
        expect(minesShown).toBe(payload.numMines);
    });

    test("a resumed WON attempt's replay board is fully open or flagged", async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // safe
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 0); // safe
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 1); // last safe cell -> win

        socket.emit.mockClear();
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        const [, payload] = socket.emit.mock.calls.find(([event]) => event === 'dailyAlreadyAttempted');
        expect(payload.status).toBe('won_pending_submit');
        expect(
            payload.board.flat().every((cell) => cell.isOpen || (cell.isMine && cell.isFlagged)),
        ).toBe(true);
    });

    test('resuming a FAILED attempt never reports rank or totalEntries -- there is no leaderboard entry', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 0, 1); // hits the mine -> failed

        socket.emit.mockClear();
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        const [, payload] = socket.emit.mock.calls.find(([event]) => event === 'dailyAlreadyAttempted');
        expect(payload.rank).toBeUndefined();
        expect(payload.totalEntries).toBeUndefined();
    });
});

describe('timing: startedAt is stamped only on the first open/chord, never at start', () => {
    test('a flag toggle before any open/chord does not start the clock', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        await dailyGame.toggleFlag(DATE, 'tok-1', 'sock-1', 0, 1);

        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(attempt.status).toBe('ready');
        expect(attempt.startedAt).toBe('');
    });

    /*
     * A flag drawn but never stored is silently dropped by the next move's
     * re-read. Saving first makes a failed write a flag that did not land.
     */
    test('a flag that fails to persist is never drawn on the client', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        mockEmit.mockClear();

        const save = jest.spyOn(dailyRepo, 'setAttemptBoard').mockRejectedValueOnce(new Error('redis blip'));

        await expect(dailyGame.toggleFlag(DATE, 'tok-1', 'sock-1', 0, 1)).rejects.toThrow('redis blip');
        expect(mockEmit).not.toHaveBeenCalledWith('dailyUpdateCells', expect.anything());

        save.mockRestore();
    });

    test('the first open stamps startedAt and flips to in_progress', async () => {
        const socket = socketFor('sock-1');
        nowSpy.mockReturnValue(BASE_TIME + 5_000);

        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1);

        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(attempt.status).toBe('in_progress');
        expect(attempt.startedAt).toBe(String(BASE_TIME + 5_000));
    });

    test('a second open does not restamp startedAt', async () => {
        const socket = socketFor('sock-1');

        nowSpy.mockReturnValue(BASE_TIME + 5_000);
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.toggleFlag(DATE, 'tok-1', 'sock-1', 0, 1); // flag first, still 'ready'
        await dailyGame.toggleFlag(DATE, 'tok-1', 'sock-1', 0, 1); // unflag, still 'ready'

        nowSpy.mockReturnValue(BASE_TIME + 6_000);
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // first real move, stamps startedAt
        const afterFirstOpen = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(afterFirstOpen.startedAt).toBe(String(BASE_TIME + 6_000));

        nowSpy.mockReturnValue(BASE_TIME + 7_000);
        await startDaily({ socket, dailyAttemptToken: 'tok-1' }); // resume, must not restamp
        const afterResume = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(afterResume.startedAt).toBe(String(BASE_TIME + 6_000));
    });
});

describe('elapsedMs is always finishedAt - startedAt, both server timestamps', () => {
    test('hitting a mine records elapsedMs from the two server-stamped times', async () => {
        const socket = socketFor('sock-1');

        nowSpy.mockReturnValue(BASE_TIME + 1_000);
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // starts the clock

        nowSpy.mockReturnValue(BASE_TIME + 4_500);
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 0, 1); // hits the mine

        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(attempt.status).toBe('failed');
        expect(attempt.elapsedMs).toBe('3500');
        // The first open put 3 of 5 safe cells up (six deciles), all at elapsed 0.
        expect(lastEmitted('dailyGameOver')).toEqual({ elapsedMs: 3500, milestones: [0, 0, 0, 0, 0, 0] });
    });

    test('dailyOpenCell and dailyChordCell accept no elapsed-time argument -- the', () => {
        // arity check: (date, token, socketId, row, col) only.
        expect(dailyGame.openCell.length).toBe(5);
        expect(dailyGame.chordCell.length).toBe(5);
    });
});

describe('submitDailyScore and the leaderboard', () => {
    test('only a won_pending_submit attempt can submit a score', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        // Still 'ready' -- never played.
        await submitDailyScore({ socket, io: { to: mockTo }, dailyAttemptToken: 'tok-1', date: DATE, name: 'Alex' });

        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(attempt.status).toBe('ready');
        expect(socket.emit).not.toHaveBeenCalledWith('dailyScoreSubmitted', expect.anything());
    });

    test('a won attempt submits, lands on the leaderboard, and broadcasts the update', async () => {
        const socket = socketFor('sock-1');
        nowSpy.mockReturnValue(BASE_TIME + 1_000);
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // safe, starts clock
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 0); // safe

        nowSpy.mockReturnValue(BASE_TIME + 3_000);
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 1); // last safe cell -> win
        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(attempt.status).toBe('won_pending_submit');

        await submitDailyScore({ socket, io: { to: mockTo }, dailyAttemptToken: 'tok-1', date: DATE, name: 'Alex' });

        expect(socket.emit).toHaveBeenCalledWith(
            'dailyScoreSubmitted',
            expect.objectContaining({ rank: 1, elapsedMs: 2000, totalEntries: 1 })
        );
        expect(mockTo).toHaveBeenCalledWith('daily-lb:2026-07-30');
        expect(mockEmit).toHaveBeenCalledWith(
            'dailyLeaderboardUpdate',
            expect.objectContaining({ entries: [expect.objectContaining({ name: 'Alex', elapsedMs: 2000 })] })
        );

        const completed = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(completed.status).toBe('completed');
    });

    /*
     * The browser trims before emitting, so these only arrive from a raw
     * socket. A leaderboard entry cannot be rewritten, so normalise before storing.
     */
    const winWith = async (token, socketId) => {
        const socket = socketFor(socketId);
        nowSpy.mockReturnValue(BASE_TIME + 1_000);
        await startDaily({ socket, dailyAttemptToken: token });
        await dailyGame.openCell(DATE, token, socketId, 1, 1);
        await dailyGame.openCell(DATE, token, socketId, 2, 0);
        nowSpy.mockReturnValue(BASE_TIME + 3_000);
        await dailyGame.openCell(DATE, token, socketId, 2, 1); // wins
        return socket;
    };

    test('a padded name lands on the leaderboard trimmed', async () => {
        const socket = await winWith('tok-1', 'sock-1');

        await submitDailyScore({ socket, io: { to: mockTo }, dailyAttemptToken: 'tok-1', date: DATE, name: '  Alex  ' });

        const [entry] = await dailyRepo.getLeaderboardTop(DATE);
        expect(entry.name).toBe('Alex');
    });

    test('a name that is only whitespace is refused rather than filed as a blank row', async () => {
        const socket = await winWith('tok-1', 'sock-1');

        await submitDailyScore({ socket, io: { to: mockTo }, dailyAttemptToken: 'tok-1', date: DATE, name: '   ' });

        expect(await dailyRepo.getLeaderboardTop(DATE)).toEqual([]);
        // Refusing must not burn the run.
        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(attempt.status).toBe('won_pending_submit');
    });

    test('getDailyLeaderboard joins the per-date channel and replies with current standings', async () => {
        const socket = { id: 'sock-1', emit: jest.fn(), join: mockJoin };

        await getDailyLeaderboard({ socket, date: DATE });

        expect(mockJoin).toHaveBeenCalledWith('daily-lb:2026-07-30');
        expect(socket.emit).toHaveBeenCalledWith('dailyLeaderboardUpdate', { entries: [] });
    });
});

describe('pace milestones ride the terminal payloads', () => {
    /*
     * 5 safe cells with 2 pre-opened (40%): the free opening's four deciles
     * stamp at elapsed 0 on the first real move, like the real fixed-center
     * opening. Timing only, never positions.
     */
    test('a win emits all 10, stamped from server time', async () => {
        const socket = socketFor('sock-1');
        nowSpy.mockReturnValue(BASE_TIME + 1_000);
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // 60% at elapsed 0
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 0); // 80% at elapsed 0

        nowSpy.mockReturnValue(BASE_TIME + 3_000);
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 1); // 100% -> win

        expect(lastEmitted('dailyWon')).toEqual({
            elapsedMs: 2_000,
            milestones: [0, 0, 0, 0, 0, 0, 0, 0, 2_000, 2_000],
        });
    });

    test('a resumed terminal attempt carries its milestones for the share text', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // 60%
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 0, 1); // mine -> failed

        socket.emit.mockClear();
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        const [, payload] = socket.emit.mock.calls.find(([event]) => event === 'dailyAlreadyAttempted');
        expect(payload.milestones).toEqual([0, 0, 0, 0, 0, 0]);
    });

    test('an attempt from before pace existed resumes with no milestones, not a crash', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 0, 1); // mine -> failed

        // Simulate the old attempt shape: field never written.
        await mockRedisSingleton.hSet(`daily:${DATE}:attempt:tok-1`, { milestones: '' });

        socket.emit.mockClear();
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        const [, payload] = socket.emit.mock.calls.find(([event]) => event === 'dailyAlreadyAttempted');
        expect(payload.milestones).toEqual([]);
    });

    test('a chord records the deciles its reveals cross', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.toggleFlag(DATE, 'tok-1', 'sock-1', 0, 1); // flag the mine
        await dailyGame.chordCell(DATE, 'tok-1', 'sock-1', 0, 0); // opens [1][1]: 60%

        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(JSON.parse(attempt.milestones)).toEqual([0, 0, 0, 0, 0, 0]);
    });

    test('a flag toggle records no pace', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });

        await dailyGame.toggleFlag(DATE, 'tok-1', 'sock-1', 0, 1);

        const attempt = await dailyRepo.getAttempt(DATE, 'tok-1');
        expect(attempt.milestones).toBe('[]');
    });
});

describe('stats recording carries the puzzle date', () => {
    // The /profile calendar keys on the PUZZLE date, and an attempt can
    // finish after UTC midnight, so finishAttempt must send the attempt's date.
    test('a win records mode daily with dailyDate = the attempt date', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 1, 1); // safe
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 0); // safe
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 2, 1); // last safe cell -> win

        expect(mockRecordForSockets).toHaveBeenCalledWith(
            ['sock-1'],
            expect.objectContaining({ mode: 'daily', won: true, dailyDate: DATE }),
        );
    });

    test('a loss records it too, dated the same way', async () => {
        const socket = socketFor('sock-1');
        await startDaily({ socket, dailyAttemptToken: 'tok-1' });
        await dailyGame.openCell(DATE, 'tok-1', 'sock-1', 0, 1); // hits the mine -> failed

        expect(mockRecordForSockets).toHaveBeenCalledWith(
            ['sock-1'],
            expect.objectContaining({ mode: 'daily', won: false, dailyDate: DATE }),
        );
    });
});
