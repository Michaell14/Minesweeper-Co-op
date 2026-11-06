/**
 * What the hot paths cost Redis. The room hash holds every board in the room
 * (three in PVP), and it used to be fetched whole by every hover (~10/s per
 * player while the mouse moves) and four or five times per click. At peak that
 * was most of the server's Redis operations and bandwidth, past the plan's
 * limits. Driven through the REAL route rows and registrar, against the
 * event-loop fake with every command counted, and the bytes each one moved.
 */

const mockEmit = jest.fn();

jest.mock('../utils/initializeClient', () => ({
    io: { to: jest.fn(() => ({ emit: mockEmit })) },
    server: {},
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

/**
 * Bytes of a hash payload, field names and values: what a write sends or a
 * read's reply carries, near enough. Keys, locks and protocol framing are
 * left out; they are small and do not grow with the board.
 */
const mockSizeOf = (payload) => {
    if (payload === null || payload === undefined) return 0;
    if (Array.isArray(payload)) return payload.reduce((total, value) => total + mockSizeOf(value), 0);
    if (typeof payload === 'object') {
        return Object.entries(payload).reduce((total, [field, value]) => total + Buffer.byteLength(field) + mockSizeOf(value), 0);
    }
    return Buffer.byteLength(String(payload));
};

const HASH_READS = ['hGetAll', 'hGet', 'hmGet'];

/** Every command the code under test sends, as [command, key, bytes moved]. */
const mockCommands = [];

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(
        new Proxy(mockRedis, {
            get: (target, name) => {
                const value = target[name];
                if (typeof value !== 'function' || ['seed', 'read', 'flush', 'locksTaken'].includes(name)) return value;
                return async (...args) => {
                    const command = [name, args[0], name === 'hSet' ? mockSizeOf(args[1]) : 0];
                    mockCommands.push(command);
                    const reply = await value(...args);
                    if (HASH_READS.includes(name)) command[2] = mockSizeOf(reply);
                    return reply;
                };
            },
        }),
    ),
}));

const roomRepo = require('../data/roomRepo');
const { createEmptyBoard, revealFrom } = require('../domain/board');
const { encodeBoard, decodeBoard } = require('../domain/boardCodec');
const { generateBoard } = require('../domain/boardGen');
const { mulberry32 } = require('../domain/seededRandom');
const { ROUTES } = require('../routes');
const { wrapRoute } = require('../routes/register');
const { CLIENT_EVENTS, SERVER_EVENTS } = require('../../shared/events');

/**
 * Fields a caller read off a narrow read (`roomRepo.getFields`) without asking
 * for them. Such a field is silently undefined — the one risk a field list
 * carries — so every scenario in this file ends by checking there were none.
 */
const strayReads = [];
const realGetFields = roomRepo.getFields;
jest.spyOn(roomRepo, 'getFields').mockImplementation(async (room, fields) =>
    new Proxy(await realGetFields(room, fields), {
        get: (target, prop) => {
            // `then` is the promise machinery probing a resolved value, not a caller.
            if (typeof prop === 'string' && prop !== 'then' && !fields.includes(prop)) strayReads.push(prop);
            return target[prop];
        },
    }));

const ROOM = 'ABCD';
const ALICE = 'sock-a';
const BOB = 'sock-b';

const routeFor = (event) => ROUTES.find((route) => route.event === event);
const hoverRoute = routeFor(CLIENT_EVENTS.CELL_HOVER);

/** A 16x16 board as stored: every hover used to pull the room hash, boards and all. */
const board16 = encodeBoard(createEmptyBoard(16, 16));

const seedRoom = (mode = 'co-op') => {
    mockRedis.seed(`room:${ROOM}`, {
        mode,
        board: board16,
        ...(mode === 'pvp' && { player1Board: board16, player2Board: board16, sharedBoard: board16 }),
        numRows: '16',
        numCols: '16',
        players: JSON.stringify([ALICE, BOB]),
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0' });
    mockRedis.seed(`player:${BOB}`, { name: 'Bob', room: ROOM, score: '0' });
};

/** Alice's socket, in the room as socket.io sees it. Relays land in `relayed`. */
const aliceSocket = () => {
    const relayed = [];
    const socket = {
        id: ALICE,
        data: {},
        rooms: new Set([ALICE, ROOM]),
        emit: jest.fn(),
        leave: jest.fn(),
        to: jest.fn(() => ({ emit: (event, payload) => relayed.push([event, payload]) })),
    };
    return { socket, relayed };
};

const hoverFrom = (socket) => wrapRoute(hoverRoute, { socket, io: {} });

/** A burst at one instant: inside both the rate limit's burst and the guard's window. */
const hoverBurst = async (listener, count) => {
    for (let i = 0; i < count; i++) await listener({ room: ROOM, row: 0, col: i % 16 });
};

beforeEach(() => {
    mockRedis.flush();
    mockCommands.length = 0;
    strayReads.length = 0;
    jest.clearAllMocks();
});

afterEach(() => {
    expect(strayReads).toEqual([]);
});

/** Full reads of the room hash: each one carries every board in the room. */
const roomHashReads = () => mockCommands.filter(([command, key]) => command === 'hGetAll' && key === `room:${ROOM}`);

describe('a co-op hover', () => {
    test('is relayed to everyone else in the room', async () => {
        seedRoom();
        const { socket, relayed } = aliceSocket();

        await hoverFrom(socket)({ room: ROOM, row: 2, col: 3 });

        expect(socket.to).toHaveBeenCalledWith(ROOM);
        expect(relayed).toEqual([
            [SERVER_EVENTS.PLAYER_HOVER_UPDATE, { id: ALICE, row: 2, col: 3, name: 'Alice' }],
        ]);
    });

    test('never fetches the room hash, so never a board', async () => {
        seedRoom();
        const { socket } = aliceSocket();

        await hoverBurst(hoverFrom(socket), 10);

        expect(mockCommands.filter(([command]) => command === 'hGetAll')).toEqual([]);
    });

    test('a burst costs Redis only its first hover', async () => {
        seedRoom();
        const { socket, relayed } = aliceSocket();
        const listener = hoverFrom(socket);

        await listener({ room: ROOM, row: 0, col: 0 });
        const firstHover = mockCommands.length;
        await hoverBurst(listener, 9);

        expect(firstHover).toBeLessThanOrEqual(3);
        expect(mockCommands).toHaveLength(firstHover);
        expect(relayed).toHaveLength(10);
    });

    test('after leaving, the next hover is checked again and goes nowhere', async () => {
        seedRoom();
        const { socket, relayed } = aliceSocket();
        const listener = hoverFrom(socket);
        await listener({ room: ROOM, row: 0, col: 0 });

        // What removePlayer does: off the roster, out of the socket.io room.
        mockRedis.seed(`room:${ROOM}`, { ...mockRedis.read(`room:${ROOM}`), players: JSON.stringify([BOB]) });
        socket.rooms.delete(ROOM);
        await listener({ room: ROOM, row: 0, col: 1 });

        expect(relayed).toHaveLength(1);
    });
});

describe('a pvp hover', () => {
    test('is dropped, as before: where a racer looks is a hint on a shared layout', async () => {
        seedRoom('pvp');
        const { socket, relayed } = aliceSocket();

        await hoverBurst(hoverFrom(socket), 5);

        expect(relayed).toEqual([]);
    });

    test('costs no board to drop, though the room holds four', async () => {
        seedRoom('pvp');
        const { socket } = aliceSocket();

        await hoverBurst(hoverFrom(socket), 5);

        expect(mockCommands.filter(([command]) => command === 'hGetAll')).toEqual([]);
        expect(mockCommands.length).toBeLessThanOrEqual(2);
    });
});

/** 4x4, one mine at (3,3), every other cell claiming one neighbour so nothing cascades. */
const quietBoard = () => {
    const board = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 })),
    );
    board[3][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    return board;
};

/** (1,1) open, so a chord on it has something to do. */
const boardWithAnOpenCell = () => {
    const board = quietBoard();
    board[1][1].isOpen = true;
    return board;
};

/** The room's dimension fields, read off the board they describe. */
const dimsOf = (board) => ({
    numRows: String(board.length),
    numCols: String(board[0].length),
    numMines: String(board.flat().filter((cell) => cell.isMine).length),
});

const seedCoopGame = (board) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'co-op', gameOver: 'false', gameWon: 'false', initialized: 'true', noGuess: 'false',
        relaxed: 'false', livesRemaining: '1',
        board: encodeBoard(board),
        ...dimsOf(board),
        players: JSON.stringify([ALICE, BOB]),
        startedAt: '1000',
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0' });
    mockRedis.seed(`player:${BOB}`, { name: 'Bob', room: ROOM, score: '0' });
};

const seedRace = (board) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'pvp', pvpStarted: 'true',
        sharedBoard: encodeBoard(quietBoard()),
        player1Board: encodeBoard(board),
        player2Board: encodeBoard(quietBoard()),
        player1Initialized: 'true', player2Initialized: 'true',
        player1GameOver: 'false', player1GameWon: 'false',
        player2GameOver: 'false', player2GameWon: 'false',
        player1Progress: '0', player2Progress: '0',
        player1Socket: ALICE, player2Socket: BOB,
        ...dimsOf(board),
        totalSafeCells: String(board.length * board[0].length - Number(dimsOf(board).numMines)),
        players: JSON.stringify([ALICE, BOB]),
        startedAt: '1000',
        winnerSocket: '',
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0', pvpPlayerIndex: '0' });
    mockRedis.seed(`player:${BOB}`, { name: 'Bob', room: ROOM, score: '0', pvpPlayerIndex: '1' });
};

const clickAs = (socket, event, row, col) => wrapRoute(routeFor(event), { socket, io: {} })({ room: ROOM, row, col });

/**
 * A move needs the board once, under its lock, and that is all. Guard,
 * dispatch, the win check and PVP's progress read only the fields they use.
 */
describe.each([
    ['co-op', seedCoopGame],
    ['pvp', seedRace],
])('a %s click', (_mode, seed) => {
    test.each([
        ['an open', CLIENT_EVENTS.OPEN_CELL, quietBoard, 0, 0],
        ['a flag', CLIENT_EVENTS.TOGGLE_FLAG, quietBoard, 0, 0],
        ['a chord', CLIENT_EVENTS.CHORD_CELL, boardWithAnOpenCell, 1, 1],
    ])('reads the room hash once for %s', async (_label, event, board, row, col) => {
        seed(board());
        const { socket } = aliceSocket();

        await clickAs(socket, event, row, col);

        expect(roomHashReads()).toHaveLength(1);
    });

    test('still lands', async () => {
        seed(quietBoard());
        const { socket } = aliceSocket();

        await clickAs(socket, CLIENT_EVENTS.OPEN_CELL, 0, 0);

        const stored = mockRedis.read(`room:${ROOM}`);
        const board = decodeBoard(stored.board ?? stored.player1Board);
        expect(board[0][0].isOpen).toBe(true);
    });
});

/** Every cell open but (0,0) and the mine, so opening (0,0) clears the board. */
const oneCellFromWinning = () => {
    const board = quietBoard();
    board.forEach((row, r) => row.forEach((cell, c) => {
        if (!cell.isMine && !(r === 0 && c === 0)) cell.isOpen = true;
    }));
    return board;
};

const emitted = () => mockEmit.mock.calls.map(([event]) => event);

/**
 * The rarer paths read more of the room — the win, the loss and the stats
 * behind them — so they are where a short field list would bite. Each runs
 * under the stray-read check above.
 */
describe('the paths that end a game read only fields they asked for', () => {
    test('a co-op win', async () => {
        seedCoopGame(oneCellFromWinning());
        const { socket } = aliceSocket();

        await clickAs(socket, CLIENT_EVENTS.OPEN_CELL, 0, 0);

        expect(emitted()).toContain(SERVER_EVENTS.GAME_WON);
    });

    test('a co-op detonation', async () => {
        seedCoopGame(quietBoard());
        const { socket } = aliceSocket();

        await clickAs(socket, CLIENT_EVENTS.OPEN_CELL, 3, 3);

        expect(emitted()).toContain(SERVER_EVENTS.GAME_OVER);
    });

    test('a pvp win', async () => {
        seedRace(oneCellFromWinning());
        const { socket } = aliceSocket();

        await clickAs(socket, CLIENT_EVENTS.OPEN_CELL, 0, 0);

        expect(emitted()).toContain(SERVER_EVENTS.PVP_PLAYER_WON);
    });

    test('a ping, bounded by the dimensions its guard read', async () => {
        seedCoopGame(quietBoard());
        const { socket } = aliceSocket();

        await wrapRoute(routeFor(CLIENT_EVENTS.PING_CELL), { socket, io: { to: () => ({ emit: mockEmit }) } })(
            { room: ROOM, row: 1, col: 2 },
        );

        expect(emitted()).toContain(SERVER_EVENTS.PLAYER_PING);
    });
});

/** 16x16 mid-game from a fixed seed, so every run plays the same move. */
const midGame16 = () => {
    const board = generateBoard(16, 16, 40, 8, 8, { noGuess: false, rng: mulberry32(7) });
    revealFrom(board, 8, 8, []);
    return board;
};

/** A closed numbered cell: a real move that opens one cell and ends nothing. */
const quietMoveOn = (board) => {
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            const cell = board[r][c];
            if (!cell.isOpen && !cell.isMine && cell.nearbyMines > 0) return [r, c];
        }
    }
    throw new Error('no quiet move on this board');
};

const bytesMoved = () => mockCommands.reduce((total, [, , bytes]) => total + bytes, 0);
const largestReply = () => Math.max(...mockCommands.filter(([command]) => HASH_READS.includes(command)).map(([, , bytes]) => bytes));

/**
 * And what a click MOVES. Its one full read carries every board in the room,
 * so the board's encoding (domain/boardCodec.js) decides the bytes: as JSON a
 * 16x16 board was ~17KB, and the PVP hash held three.
 */
describe('a 16x16 click', () => {
    test('in co-op writes a board of a few hundred bytes and moves under 2KB in all', async () => {
        const board = midGame16();
        seedCoopGame(board);
        const { socket } = aliceSocket();

        await clickAs(socket, CLIENT_EVENTS.OPEN_CELL, ...quietMoveOn(board));

        const stored = mockRedis.read(`room:${ROOM}`).board;
        expect(stored).toMatch(/^b1:16x16:/);
        expect(Buffer.byteLength(stored)).toBeLessThan(300);
        expect(largestReply()).toBeLessThan(1024);
        expect(bytesMoved()).toBeLessThan(2 * 1024);
    });

    test('in PVP, with three boards in the room, still moves under 3KB in all', async () => {
        const board = midGame16();
        seedRace(board);
        mockRedis.seed(`room:${ROOM}`, {
            ...mockRedis.read(`room:${ROOM}`), player2Board: encodeBoard(board), sharedBoard: encodeBoard(board),
        });
        const { socket } = aliceSocket();

        await clickAs(socket, CLIENT_EVENTS.OPEN_CELL, ...quietMoveOn(board));

        expect(Buffer.byteLength(mockRedis.read(`room:${ROOM}`).player1Board)).toBeLessThan(300);
        // One JSON board alone was ~17KB, and this reply holds all three.
        expect(largestReply()).toBeLessThan(2 * 1024);
        expect(bytesMoved()).toBeLessThan(3 * 1024);
    });
});
