/**
 * Regression: two overlapping co-op moves must not lose one another's work.
 *
 * openCell, chordCell and toggleFlag each take a whole-board snapshot, mutate a
 * local copy, emit the cells they changed, and write the ENTIRE board back. With
 * no mutual exclusion, two moves that overlap both read the board before either
 * writes, and the second write erases the first player's reveals.
 *
 * Nothing errors when this happens. The clients were sent both sets of updates,
 * so the UI shows a board the server does not have, and because the server's
 * board still has closed safe cells, checkWin never fires: the game looks
 * finished and simply never ends. Observed in a real 9x9 room with moves 320ms
 * apart.
 *
 * These drive the real dispatch entry point in game/index.js against a Redis
 * fake that resolves on the event loop (tests/setup/fakeRedis.js), because the
 * race is in the gap between a read and its write — the shared mock has no
 * store, so nothing it hands back can be stale.
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

/**
 * 4x4 with a single mine at (3,3) and every other cell claiming one adjacent
 * mine, so no click cascades and each assertion is about the cells it names.
 */
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

        // The clients acted on every updateCells they were sent. If the server
        // kept less than it announced, the UI is permanently ahead of it and
        // nothing will ever reconcile the two.
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
     * Which of the two happened "first" is genuinely ambiguous — the players
     * pressed at the same moment — so neither outcome is the right one to pin
     * down. What must hold either way is that the room stays self-consistent:
     * `initialized` and the board have to agree, or the next click generates a
     * second board over a room that already has one.
     */
    const assertRoomIsCoherent = () => {
        const room = storedRoom();
        const board = storedBoard();
        const open = openCoords(board);
        const mines = board.flat().filter((cell) => cell.isMine).length;

        // `gameOver` / `gameWon` are deliberately not asserted. A move that lands
        // after the reset is a legitimate first click on the new game, and on a
        // board this small its cascade can clear the whole thing and win on the
        // spot. That is a real outcome, not the corruption being tested for.

        if (room.initialized === 'false') {
            // The reset landed last: an unplayed grid, waiting for a first click.
            // Flags are not checked — flagging before the first click is legal,
            // so a flag here says nothing about whether the reset was clobbered.
            expect(open).toEqual([]);
            expect(mines).toBe(0);
        } else {
            // The move landed last: a real board with the cells it opened.
            expect(open.length).toBeGreaterThan(0);
        }

        // Whichever way it went, the score has to describe the board that is
        // actually there — reset zeroes the scores, and a move that survived the
        // reset scores a point per cell it opened.
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
        // (0,0) already open and claiming no adjacent mines, so chording it with
        // nothing flagged opens (0,1), (1,0) and (1,1).
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
