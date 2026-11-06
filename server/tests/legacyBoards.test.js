/**
 * Boards written as JSON before the encoding (domain/boardCodec.js) are still
 * in Redis after the deploy that ships it: rooms live 24h, daily attempts 48h.
 * Every case seeds a game mid-play in the OLD format and plays it through the
 * real handlers against the event-loop fake. The move must see the board as it
 * stood, and whatever it writes back is the new format.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
jest.mock('../utils/initializeClient', () => ({ io: { to: mockTo }, server: {} }));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();
jest.mock('../utils/initializeRedisClient', () => ({ redisClient: Promise.resolve(mockRedis) }));

const { openCell, chordCell, toggleFlag } = require('../game');
const daily = require('../game/daily');
const { resetMyBoard } = require('../controllers/pvpController');
const { startDaily } = require('../controllers/dailyController');
const { addPlayerToRoom, removePlayer } = require('../utils/playerUtils');
const roomRepo = require('../data/roomRepo');
const { encodeBoard, decodeBoard } = require('../domain/boardCodec');
const { projectBoard } = require('../domain/board');
const { SERVER_EVENTS: E } = require('../../shared/events');

const ROOM = 'legacy';
const ALICE = 'alice';
const BOB = 'bob';

/**
 * 4x4 mid-game: a flagged mine at (0,0) and (1,1) already open. Every safe
 * cell claims one neighbour, so nothing cascades.
 */
const midGame = () => {
    const board = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 })));
    board[0][0] = { isMine: true, isOpen: false, isFlagged: true, nearbyMines: 0 };
    board[1][1].isOpen = true;
    return board;
};

/** Every safe cell open but (3,3). */
const oneFromWinning = () => {
    const board = midGame();
    board.flat().forEach((cell) => { cell.isOpen = !cell.isMine; });
    board[3][3].isOpen = false;
    return board;
};

const openCoords = (board) => {
    const open = [];
    board.forEach((row, r) => row.forEach((cell, c) => cell.isOpen && open.push(`${r},${c}`)));
    return open.sort();
};

const emitted = (event) => mockEmit.mock.calls.filter(([name]) => name === event).map(([, payload]) => payload);

const emittedTo = (target, event) => mockEmit.mock.calls.flatMap(([name, payload], i) =>
    name === event && mockTo.mock.calls[i][0] === target ? [payload] : []);

/** (3,3) as a client sees it once opened. */
const OPENED_3_3 = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1, row: 3, col: 3 };

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
});

afterEach(() => jest.restoreAllMocks());

describe('a co-op room mid-game', () => {
    const stored = () => mockRedis.read(`room:${ROOM}`).board;

    beforeEach(() => {
        mockRedis.seed(`room:${ROOM}`, {
            mode: 'co-op', gameOver: 'false', gameWon: 'false', initialized: 'true', noGuess: 'false',
            board: JSON.stringify(midGame()),
            numRows: '4', numCols: '4', numMines: '1',
            players: JSON.stringify([ALICE]), startedAt: '1000',
        });
        mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0' });
    });

    test('a click opens the cell, keeps what was played, and stores the new format', async () => {
        await openCell(3, 3, ROOM, ALICE);

        expect(stored()).toMatch(/^b1:4x4:/);
        const board = decodeBoard(stored());
        expect(openCoords(board)).toEqual(['1,1', '3,3']);
        expect(board[0][0]).toMatchObject({ isOpen: false, isFlagged: true });
        expect(emitted(E.UPDATE_CELLS).at(-1)).toEqual([OPENED_3_3]);
        expect(mockRedis.read(`player:${ALICE}`).score).toBe('1');
    });

    test('a chord counts the flag the old board carried', async () => {
        await chordCell(1, 1, ROOM, ALICE);

        const board = decodeBoard(stored());
        expect(openCoords(board)).toEqual(['0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2']);
        expect(board[0][0]).toMatchObject({ isOpen: false, isFlagged: true });
    });

    test('a flag lands beside the ones already placed', async () => {
        await toggleFlag(3, 0, ROOM, ALICE);

        const board = decodeBoard(stored());
        expect(board[3][0].isFlagged).toBe(true);
        expect(board[0][0].isFlagged).toBe(true);
    });

    test('the winning move finishes the old board', async () => {
        mockRedis.seed(`room:${ROOM}`, { ...mockRedis.read(`room:${ROOM}`), board: JSON.stringify(oneFromWinning()) });

        await openCell(3, 3, ROOM, ALICE);

        expect(mockRedis.read(`room:${ROOM}`).gameWon).toBe('true');
        expect(decodeBoard(stored()).flat().every((cell) => cell.isOpen || cell.isFlagged)).toBe(true);
    });

    test('a player joining mid-game is sent the board as it stood', async () => {
        await addPlayerToRoom(ROOM, BOB, 'Bob');

        expect(emitted(E.BOARD_UPDATE).at(-1)).toEqual(projectBoard(midGame()));
    });
});

describe('a PVP race mid-game', () => {
    const SESSION = 'alice-session';
    const RETURNED = 'alice-returned';
    const storedRoom = () => mockRedis.read(`room:${ROOM}`);

    beforeEach(() => {
        mockRedis.seed(`room:${ROOM}`, {
            mode: 'pvp', pvpStarted: 'true', hostSocket: ALICE,
            numRows: '4', numCols: '4', numMines: '1', totalSafeCells: '15',
            players: JSON.stringify([ALICE, BOB]), startedAt: '1000', winnerSocket: '',
            player1Socket: ALICE, player2Socket: BOB,
            player1Board: JSON.stringify(midGame()), player2Board: JSON.stringify(midGame()),
            player1Initialized: 'true', player2Initialized: 'true',
            player1GameOver: 'false', player2GameOver: 'false',
            player1GameWon: 'false', player2GameWon: 'false',
            player1Progress: '1', player2Progress: '1',
            sharedBoard: JSON.stringify(midGame()), sharedOpenedCells: '1',
        });
        mockRedis.seed(`player:${ALICE}`, { room: ROOM, name: 'Alice', score: '0', pvpPlayerIndex: '0', sessionId: SESSION });
        mockRedis.seed(`player:${BOB}`, { room: ROOM, name: 'Bob', score: '0', pvpPlayerIndex: '1' });
        mockRedis.seed(`session:${SESSION}`, { room: ROOM, name: 'Alice', socketId: ALICE });
    });

    test('a click plays the racer\'s old board, and rewrites only theirs', async () => {
        const opponents = storedRoom().player2Board;

        await openCell(3, 3, ROOM, ALICE);

        expect(storedRoom().player1Board).toMatch(/^b1:4x4:/);
        expect(openCoords(decodeBoard(storedRoom().player1Board))).toEqual(['1,1', '3,3']);
        expect(storedRoom().player1Progress).toBe('2');
        expect(emittedTo(ALICE, E.PVP_UPDATE_CELLS).at(-1)).toEqual([OPENED_3_3]);
        expect(storedRoom().player2Board).toBe(opponents);
    });

    test('a chord and a flag play on it too', async () => {
        await chordCell(1, 1, ROOM, BOB);
        await toggleFlag(3, 3, ROOM, BOB);

        const board = decodeBoard(storedRoom().player2Board);
        expect(openCoords(board)).toEqual(['0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2']);
        expect(board[3][3].isFlagged).toBe(true);
    });

    test('a reset restores the old starting board, in the new format', async () => {
        await openCell(3, 3, ROOM, ALICE);

        await resetMyBoard({ socket: { id: ALICE }, room: ROOM, io: { to: mockTo } });

        expect(storedRoom().player1Board).toBe(encodeBoard(midGame()));
        expect(storedRoom().player1Progress).toBe('1');
        expect(emittedTo(ALICE, E.PVP_BOARD_UPDATE).at(-1).board).toEqual(projectBoard(midGame()));
    });

    test('the race\'s end reveals the loser\'s old board, and a reload brings it back', async () => {
        mockRedis.seed(`room:${ROOM}`, { ...storedRoom(), player2Board: JSON.stringify(oneFromWinning()) });
        const revealed = projectBoard(midGame(), { revealMines: true });

        await openCell(3, 3, ROOM, BOB);

        expect(storedRoom().winnerSocket).toBe(BOB);
        expect(emittedTo(ALICE, E.PVP_BOARD_UPDATE).at(-1).board).toEqual(revealed);

        await removePlayer({ leave: jest.fn(), to: () => ({ emit: jest.fn() }) }, ALICE);
        jest.clearAllMocks();
        await roomRepo.withJoinLock(ROOM, RETURNED, () => addPlayerToRoom(ROOM, RETURNED, 'Alice', SESSION));

        expect(emittedTo(RETURNED, E.PVP_BOARD_UPDATE).at(-1).board).toEqual(revealed);
    });
});

describe('a daily attempt started before the deploy', () => {
    const DATE = '2026-11-06';
    const TOKEN = 'tok-legacy';
    const attemptKey = (token) => `daily:${DATE}:attempt:${token}`;
    const socketFor = (id) => ({ id, emit: jest.fn(), join: jest.fn() });

    beforeEach(() => {
        mockRedis.seed(attemptKey(TOKEN), {
            status: 'in_progress', board: JSON.stringify(midGame()), name: '',
            startedAt: '1000', finishedAt: '', elapsedMs: '', milestones: '[]', socketId: ALICE,
        });
        mockRedis.seed(`daily:${DATE}:board`, {
            board: JSON.stringify(midGame()), seed: '1', numRows: '4', numCols: '4', numMines: '1',
            openedCells: '1', startRow: '1', startCol: '1',
        });
        // startDaily files under the server's own UTC day.
        jest.spyOn(Date, 'now').mockReturnValue(Date.parse(`${DATE}T12:00:00.000Z`));
    });

    test('plays on, and stores the new format', async () => {
        await daily.openCell(DATE, TOKEN, ALICE, 3, 3);

        const stored = mockRedis.read(attemptKey(TOKEN)).board;
        expect(stored).toMatch(/^b1:4x4:/);
        expect(openCoords(decodeBoard(stored))).toEqual(['1,1', '3,3']);
        expect(emitted(E.DAILY_UPDATE_CELLS).at(-1)).toEqual([OPENED_3_3]);
    });

    test('a chord and a flag land on it', async () => {
        await daily.chordCell(DATE, TOKEN, ALICE, 1, 1);
        await daily.toggleFlag(DATE, TOKEN, ALICE, 3, 3);

        const board = decodeBoard(mockRedis.read(attemptKey(TOKEN)).board);
        expect(openCoords(board)).toEqual(['0,1', '0,2', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2']);
        expect(board[3][3].isFlagged).toBe(true);
    });

    test('resuming it sends the board as it stood', async () => {
        const socket = socketFor(ALICE);

        await startDaily({ socket, dailyAttemptToken: TOKEN });

        expect(socket.emit).toHaveBeenCalledWith(E.DAILY_STARTED,
            expect.objectContaining({ board: projectBoard(midGame()) }));
    });

    test('a template stored as JSON still deals a new attempt, in the new format', async () => {
        const socket = socketFor(BOB);

        await startDaily({ socket, dailyAttemptToken: 'tok-new' });

        expect(mockRedis.read(attemptKey('tok-new')).board).toBe(encodeBoard(midGame()));
        expect(socket.emit).toHaveBeenCalledWith(E.DAILY_STARTED,
            expect.objectContaining({ board: projectBoard(midGame()) }));
    });
});
