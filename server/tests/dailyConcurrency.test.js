/**
 * Regression: two overlapping moves on one daily attempt must not lose one
 * another's work. The daily has the read-modify-write shape co-op and PVP were
 * fixed for, and one attempt is one browser whose token lives in localStorage,
 * SHARED ACROSS TABS. A lost reveal leaves a closed safe cell that can never
 * reopen, so the attempt never completes, with no error. Needs the event-loop
 * Redis fake: the shared mock has no store, so no write can land on another.
 */

const mockEmit = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    io: { to: jest.fn(() => ({ emit: mockEmit })) },
    server: {},
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

const daily = require('../game/daily');

const DATE = '2026-08-02';
const TOKEN = 'tok-1';
const SOCKET = 'sock-1';
const ATTEMPT = `daily:${DATE}:attempt:${TOKEN}`;

/** 4x4, one mine at (3,3), nothing cascades. */
const quietBoard = () => {
    const board = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
    );
    board[3][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    return board;
};

const seedAttempt = (board = quietBoard(), extra = {}) => {
    mockRedis.seed(ATTEMPT, {
        status: 'in_progress',
        board: JSON.stringify(board),
        name: '',
        startedAt: '1000',
        finishedAt: '',
        elapsedMs: '',
        socketId: SOCKET,
        ...extra,
    });
};

const storedAttempt = () => mockRedis.read(ATTEMPT);
const storedBoard = () => JSON.parse(storedAttempt().board);

const openCoords = (board) => {
    const open = [];
    board.forEach((row, r) => row.forEach((cell, c) => cell.isOpen && open.push(`${r},${c}`)));
    return open.sort();
};

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
});

describe('two clicks in quick succession on one attempt', () => {
    test('both reveals survive', async () => {
        seedAttempt();

        await Promise.all([
            daily.openCell(DATE, TOKEN, SOCKET, 0, 0),
            daily.openCell(DATE, TOKEN, SOCKET, 2, 2),
        ]);

        expect(openCoords(storedBoard())).toEqual(['0,0', '2,2']);
    });
});

describe('a flag and a click at the same moment', () => {
    test('keeps both', async () => {
        seedAttempt();

        await Promise.all([
            daily.toggleFlag(DATE, TOKEN, SOCKET, 3, 0),
            daily.openCell(DATE, TOKEN, SOCKET, 0, 0),
        ]);

        const board = storedBoard();
        expect(board[3][0].isFlagged).toBe(true);
        expect(board[0][0].isOpen).toBe(true);
    });
});

describe('a chord overlapping a click', () => {
    test('keeps every cell both moves opened', async () => {
        // (0,0) is open with no adjacent mines, so chording it opens (0,1), (1,0) and (1,1).
        const board = quietBoard();
        board[0][0] = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 0 };

        seedAttempt(board);

        await Promise.all([
            daily.chordCell(DATE, TOKEN, SOCKET, 0, 0),
            daily.openCell(DATE, TOKEN, SOCKET, 3, 0),
        ]);

        expect(openCoords(storedBoard())).toEqual(['0,0', '0,1', '1,0', '1,1', '3,0']);
    });
});

describe('the last two safe cells, clicked together', () => {
    const nearlyDone = () => {
        const board = quietBoard();
        board.forEach((row, r) => row.forEach((cell, c) => {
            cell.isOpen = !cell.isMine && !(r === 0 && c === 0) && !(r === 2 && c === 2);
        }));
        return board;
    };

    test('the attempt finishes rather than stranding a cell that can never reopen', async () => {
        seedAttempt(nearlyDone());

        await Promise.all([
            daily.openCell(DATE, TOKEN, SOCKET, 0, 0),
            daily.openCell(DATE, TOKEN, SOCKET, 2, 2),
        ]);

        expect(storedBoard().flat().filter((c) => !c.isOpen && !c.isMine)).toEqual([]);
    });

    test('and is recorded as won, so it can reach the leaderboard', async () => {
        seedAttempt(nearlyDone());

        await Promise.all([
            daily.openCell(DATE, TOKEN, SOCKET, 0, 0),
            daily.openCell(DATE, TOKEN, SOCKET, 2, 2),
        ]);

        expect(storedAttempt().status).toBe('won_pending_submit');
        expect(mockEmit.mock.calls.map((c) => c[0])).toContain('dailyWon');
    });

    test('announces the win exactly once', async () => {
        seedAttempt(nearlyDone());

        await Promise.all([
            daily.openCell(DATE, TOKEN, SOCKET, 0, 0),
            daily.openCell(DATE, TOKEN, SOCKET, 2, 2),
        ]);

        const wins = mockEmit.mock.calls.filter((c) => c[0] === 'dailyWon');
        expect(wins).toHaveLength(1);
    });
});

describe('two different players', () => {
    test('are not serialised against each other — separate attempts, separate locks', async () => {
        seedAttempt();
        mockRedis.seed(`daily:${DATE}:attempt:tok-2`, {
            status: 'in_progress',
            board: JSON.stringify(quietBoard()),
            name: '', startedAt: '1000', finishedAt: '', elapsedMs: '', socketId: 'sock-2',
        });

        await Promise.all([
            daily.openCell(DATE, TOKEN, SOCKET, 0, 0),
            daily.openCell(DATE, 'tok-2', 'sock-2', 1, 1),
        ]);

        expect(openCoords(storedBoard())).toEqual(['0,0']);
        expect(openCoords(JSON.parse(mockRedis.read(`daily:${DATE}:attempt:tok-2`).board))).toEqual(['1,1']);

        const lockKeys = mockRedis.locksTaken();
        expect(new Set(lockKeys).size).toBe(2);
    });
});
