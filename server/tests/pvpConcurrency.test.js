/**
 * Regression: two overlapping moves from the SAME PVP player must not lose
 * one another's work. Each move parses that player's board out of the room
 * hash and writes the whole field back, so overlapping moves erase each other;
 * a lost reveal leaves a closed safe cell that can never reopen, so the player
 * can never win, and `player1Progress` is never recomputed. The two PLAYERS
 * are meant to race, so the lock is per player; the last test pins that.
 * Needs tests/setup/fakeRedis.js, like coopConcurrency.test.js.
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

const { openCell, chordCell, toggleFlag } = require('../game');

const ROOM = 'p1';
const ALICE = 'sock-1';   // pvpPlayerIndex 0 -> player1* fields
const BOB = 'sock-2';     // pvpPlayerIndex 1 -> player2* fields

/** 4x4, one mine at (3,3), nothing cascades. */
const quietBoard = () => {
    const board = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
    );
    board[3][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    return board;
};

const seedRace = (aliceBoard = quietBoard(), extra = {}) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'pvp',
        pvpStarted: 'true',
        player1Board: JSON.stringify(aliceBoard),
        player2Board: JSON.stringify(quietBoard()),
        player1Initialized: 'true',
        player2Initialized: 'true',
        player1GameOver: 'false', player1GameWon: 'false',
        player2GameOver: 'false', player2GameWon: 'false',
        player1Progress: '0', player2Progress: '0',
        totalSafeCells: '15',
        numRows: '4', numCols: '4', numMines: '1',
        players: JSON.stringify([ALICE, BOB]),
        startedAt: '1000',
        winnerSocket: '',
        ...extra,
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0', pvpPlayerIndex: '0' });
    mockRedis.seed(`player:${BOB}`, { name: 'Bob', room: ROOM, score: '0', pvpPlayerIndex: '1' });
};

const storedRoom = () => mockRedis.read(`room:${ROOM}`);
const boardOf = (field) => JSON.parse(storedRoom()[field]);

const openCoords = (board) => {
    const open = [];
    board.forEach((row, r) => row.forEach((cell, c) => cell.isOpen && open.push(`${r},${c}`)));
    return open.sort();
};

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
});

describe('one player clicking twice in quick succession', () => {
    test('both reveals survive', async () => {
        seedRace();

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, ALICE),
        ]);

        expect(openCoords(boardOf('player1Board'))).toEqual(['0,0', '2,2']);
    });

    test('progress counts both, or the opponent watches a bar that is permanently wrong', async () => {
        seedRace();

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, ALICE),
        ]);

        expect(storedRoom().player1Progress).toBe('2');
    });

    test('both clicks are scored', async () => {
        seedRace();

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, ALICE),
        ]);

        expect(mockRedis.read(`player:${ALICE}`).score).toBe('2');
    });
});

describe('a flag and a click from the same player', () => {
    test('keeps both', async () => {
        seedRace();

        await Promise.all([
            toggleFlag(3, 0, ROOM, ALICE),
            openCell(0, 0, ROOM, ALICE),
        ]);

        const board = boardOf('player1Board');
        expect(board[3][0].isFlagged).toBe(true);
        expect(board[0][0].isOpen).toBe(true);
    });
});

describe('a chord overlapping that player own click', () => {
    test('keeps every cell both moves opened', async () => {
        // (0,0) is open claiming no adjacent mines, so chording it opens (0,1), (1,0) and (1,1).
        const board = quietBoard();
        board[0][0] = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 0 };

        seedRace(board);

        await Promise.all([
            chordCell(0, 0, ROOM, ALICE),
            openCell(3, 0, ROOM, ALICE),
        ]);

        expect(openCoords(boardOf('player1Board'))).toEqual(['0,0', '0,1', '1,0', '1,1', '3,0']);
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

    test('the player finishes their board', async () => {
        seedRace(nearlyDone(), { player1Progress: '13' });

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, ALICE),
        ]);

        expect(boardOf('player1Board').flat().filter((c) => !c.isOpen && !c.isMine)).toEqual([]);
    });

    test('and wins the race, rather than being locked out of ever winning it', async () => {
        seedRace(nearlyDone(), { player1Progress: '13' });

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, ALICE),
        ]);

        expect(storedRoom().player1GameWon).toBe('true');
        expect(storedRoom().winnerSocket).toBe(ALICE);
    });
});

describe('the two players', () => {
    test('never touch each other boards', async () => {
        seedRace();

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(1, 1, ROOM, BOB),
        ]);

        expect(openCoords(boardOf('player1Board'))).toEqual(['0,0']);
        expect(openCoords(boardOf('player2Board'))).toEqual(['1,1']);
    });

    test('are not serialised against each other — PVP is a race', async () => {
        seedRace();

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(1, 1, ROOM, BOB),
        ]);

        // Distinct keys, so neither player ever waits on the other's move.
        const lockKeys = mockRedis.locksTaken().filter((key) => key.startsWith('action_lock:'));
        expect(new Set(lockKeys).size).toBe(2);
    });
});
