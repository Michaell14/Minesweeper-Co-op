/**
 * Regression: two overlapping co-op moves must not lose one another's work.
 * Each move snapshots the whole board and writes it back entire, so unlocked
 * overlaps erase reveals silently: clients show a board the server lacks and
 * checkWin never fires. Driven through game/index.js against the event-loop
 * Redis fake (tests/setup/fakeRedis.js), since the shared mock has no store
 * and nothing it returns can be stale.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

const { openCell, chordCell, toggleFlag } = require('../game');
const { resetGame } = require('../utils/gameUtils');

const ROOM = 'r1';
const ALICE = 'sock-a';
const BOB = 'sock-b';

/** 4x4, one mine at (3,3), every other cell claiming one neighbour so nothing cascades. */
const quietBoard = () => {
    const board = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 }))
    );
    board[3][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    return board;
};

const seedRoom = (board, extra = {}) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'co-op',
        gameOver: 'false',
        gameWon: 'false',
        initialized: 'true',
        noGuess: 'false',
        board: JSON.stringify(board),
        numRows: '4',
        numCols: '4',
        numMines: '1',
        players: JSON.stringify([ALICE, BOB]),
        startedAt: '1000',
        ...extra,
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0' });
    mockRedis.seed(`player:${BOB}`, { name: 'Bob', room: ROOM, score: '0' });
};

/** The board as the SERVER now holds it. */
const storedBoard = () => JSON.parse(mockRedis.read(`room:${ROOM}`).board);

const storedRoom = () => mockRedis.read(`room:${ROOM}`);

const openCoords = (board) => {
    const open = [];
    board.forEach((row, r) => row.forEach((cell, c) => cell.isOpen && open.push(`${r},${c}`)));
    return open.sort();
};

/** Every cell the room was TOLD had opened, across all incremental updates. */
const announcedOpenCoords = () => {
    const announced = new Set();
    for (const [event, payload] of mockEmit.mock.calls) {
        if (event !== 'updateCells') continue;
        payload.filter((cell) => cell.isOpen).forEach((cell) => announced.add(`${cell.row},${cell.col}`));
    }
    return [...announced].sort();
};

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
});

describe('two players clicking at the same time', () => {
    test('both reveals survive', async () => {
        seedRoom(quietBoard());

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, BOB),
        ]);

        expect(openCoords(storedBoard())).toEqual(['0,0', '2,2']);
    });

    test('the server ends up holding the board the players were shown', async () => {
        seedRoom(quietBoard());

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, BOB),
        ]);

        // If the server kept less than it announced, the UI is permanently ahead of it.
        expect(openCoords(storedBoard())).toEqual(announcedOpenCoords());
    });

    test('each player scores what their own click opened', async () => {
        seedRoom(quietBoard());

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, BOB),
        ]);

        expect(mockRedis.read(`player:${ALICE}`).score).toBe('1');
        expect(mockRedis.read(`player:${BOB}`).score).toBe('1');
    });

    test('the same player clicking twice scores both clicks', async () => {
        seedRoom(quietBoard());

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, ALICE),
        ]);

        expect(mockRedis.read(`player:${ALICE}`).score).toBe('2');
    });
});

describe('the last two safe cells, opened at the same time', () => {
    /** Everything open but (0,0) and (2,2). Opening both wins the game. */
    const nearlyWonBoard = () => {
        const board = quietBoard();
        board.forEach((row, r) => row.forEach((cell, c) => {
            cell.isOpen = !cell.isMine && !(r === 0 && c === 0) && !(r === 2 && c === 2);
        }));
        return board;
    };

    test('the game is won', async () => {
        seedRoom(nearlyWonBoard());

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, BOB),
        ]);

        expect(storedRoom().gameWon).toBe('true');
        expect(mockEmit.mock.calls.map((c) => c[0])).toContain('gameWon');
    });

    test('the end of the game is stamped, so the summary has a time to show', async () => {
        seedRoom(nearlyWonBoard());

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            openCell(2, 2, ROOM, BOB),
        ]);

        expect(storedRoom().endedAt).toBeDefined();
    });
});

describe('a flag placed while someone else is clicking', () => {
    test('keeps both the flag and the reveal', async () => {
        seedRoom(quietBoard());

        await Promise.all([
            toggleFlag(3, 3, ROOM, ALICE),
            openCell(0, 0, ROOM, BOB),
        ]);

        const board = storedBoard();
        expect(board[3][3].isFlagged).toBe(true);
        expect(board[0][0].isOpen).toBe(true);
    });
});

describe('a reset landing while a move is in flight', () => {
    /**
     * Which landed first is ambiguous, so neither outcome is pinned. The room
     * must stay self-consistent: `initialized` and the board have to agree.
     */
    const assertRoomIsCoherent = () => {
        const room = storedRoom();
        const board = storedBoard();
        const open = openCoords(board);
        const mines = board.flat().filter((cell) => cell.isMine).length;

        // `gameOver` / `gameWon` are not asserted: a move landing after the
        // reset is a legitimate first click that can win a board this small.

        if (room.initialized === 'false') {
            // The reset landed last. Flags are not checked: flagging before
            // the first click is legal.
            expect(open).toEqual([]);
            expect(mines).toBe(0);
        } else {
            // The move landed last: a real board with the cells it opened.
            expect(open.length).toBeGreaterThan(0);
        }

        // Either way the score has to describe the board that is actually there.
        expect(parseInt(mockRedis.read(`player:${ALICE}`).score, 10)).toBe(open.length);
    };

    const playedBoard = () => {
        const board = quietBoard();
        board[1][1].isOpen = true;
        board[1][2].isOpen = true;
        return board;
    };

    test('leaves the room coherent when a click overlaps it', async () => {
        seedRoom(playedBoard(), { gameOver: 'true', gameOverName: 'Alice' });
        mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '2' });

        await Promise.all([
            openCell(0, 0, ROOM, ALICE),
            resetGame(ROOM),
        ]);

        assertRoomIsCoherent();
    });
});

describe('a chord overlapping a click', () => {
    test('keeps every cell both moves opened', async () => {
        // (0,0) open with no adjacent mines, so chording it opens (0,1), (1,0) and (1,1).
        const board = quietBoard();
        board[0][0] = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 0 };

        seedRoom(board);

        await Promise.all([
            chordCell(0, 0, ROOM, ALICE),
            openCell(3, 0, ROOM, BOB),
        ]);

        expect(openCoords(storedBoard())).toEqual(['0,0', '0,1', '1,0', '1,1', '3,0']);
    });
});
