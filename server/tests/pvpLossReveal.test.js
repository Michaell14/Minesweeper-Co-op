/**
 * What a racer who detonates is allowed to see. Hitting a mine used to send
 * that player their whole board with every mine, as a terminal state may
 * (ARCHITECTURE.md §3.1) — but a PVP loss is NOT terminal: `resetMyBoard`
 * puts them back on the SAME shared layout, so the reveal was an answer key.
 * Now only a DECIDED race reveals a PVP board (`revealToLoser`, and the resume
 * path covered by pvpResume.test.js). A dead player keeps the mine they hit,
 * which is open and therefore projected.
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

const { openCell } = require('../game');
const { SERVER_EVENTS } = require('../../shared/events');

const ROOM = 'r-loss';
const ALICE = 'sock-a';   // slot 0
const BOB = 'sock-b';     // slot 1

/** 4x4 with mines at (3,3) and (0,3). Nothing cascades. */
const board = () => {
    const b = Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 })),
    );
    b[3][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    b[0][3] = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };
    return b;
};

const seedRace = (extra = {}) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'pvp',
        pvpStarted: 'true',
        player1Board: JSON.stringify(board()),
        player2Board: JSON.stringify(board()),
        player1Initialized: 'true', player2Initialized: 'true',
        player1GameOver: 'false', player1GameWon: 'false',
        player2GameOver: 'false', player2GameWon: 'false',
        player1Progress: '0', player2Progress: '0',
        player1Socket: ALICE, player2Socket: BOB,
        totalSafeCells: '14',
        numRows: '4', numCols: '4', numMines: '2',
        players: JSON.stringify([ALICE, BOB]),
        startedAt: '1000',
        winnerSocket: '',
        ...extra,
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0', pvpPlayerIndex: '0' });
    mockRedis.seed(`player:${BOB}`, { name: 'Bob', room: ROOM, score: '0', pvpPlayerIndex: '1' });
};

/** The board from the last pvpBoardUpdate sent to anyone. */
const lastBoardSent = () => {
    const call = [...mockEmit.mock.calls].reverse()
        .find(([event]) => event === SERVER_EVENTS.PVP_BOARD_UPDATE);
    return call ? call[1].board : null;
};

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
});

describe('a racer who hits a mine mid-race', () => {
    test('is not shown the mines they have not hit', async () => {
        seedRace();

        await openCell(3, 3, ROOM, ALICE);   // detonate

        const sent = lastBoardSent();
        expect(sent).not.toBeNull();
        // The OTHER mine is the answer key, and stays closed and undisclosed.
        expect(sent[0][3].isOpen).toBe(false);
        expect(sent[0][3].isMine).toBe(false);
    });

    test('still sees the mine that killed them', async () => {
        seedRace();

        await openCell(3, 3, ROOM, ALICE);

        const sent = lastBoardSent();
        // `revealFrom` opens the mine it hits, and projection tells the truth about open cells.
        expect(sent[3][3].isOpen).toBe(true);
        expect(sent[3][3].isMine).toBe(true);
    });

    test('is still told the race is over for them', async () => {
        seedRace();

        await openCell(3, 3, ROOM, ALICE);

        const events = mockEmit.mock.calls.map(([event]) => event);
        expect(events).toContain(SERVER_EVENTS.PVP_GAME_OVER);
    });

    test('a closed safe cell keeps its neighbour count hidden too', async () => {
        // The count is nearly the answer: it solves the board offline.
        seedRace();

        await openCell(3, 3, ROOM, ALICE);

        const sent = lastBoardSent();
        expect(sent[1][1].isOpen).toBe(false);
        expect(sent[1][1].nearbyMines).toBe(0);
    });
});
