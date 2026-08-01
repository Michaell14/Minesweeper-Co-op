/**
 * PVP players race one identical board.
 *
 * Boards used to be generated lazily around each player's own first click, which
 * is precisely why the two differed — the layout depended on where you clicked.
 * Now startPvpGame builds one board, no-guess verified around a shared start
 * cell, opens that cell, and hands the same thing to both players.
 *
 * The first-click guarantee still holds, but it moves: instead of "your first
 * click is safe", the game opens a safe cell for both of you before either
 * clicks. Nobody can lose on move one.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const { startPvpGame, resetMyBoard, pvpRematch } = require('../controllers/pvpController');
const { redisClient } = require('../utils/initializeRedisClient');

const ROOM = 'r1';
const HOST = 'sock-host';
const GUEST = 'sock-guest';

let client;
let stored;

const isValid = async () => true;
const io = { to: mockTo };

/** Fields written to the room hash, merged in call order. */
const roomFields = () =>
    client.hSet.mock.calls
        .filter((c) => c[0] === `room:${ROOM}`)
        .reduce((acc, c) => Object.assign(acc, c[1]), {});

const lobbyRoom = (extra = {}) => ({
    mode: 'pvp',
    pvpStarted: 'false',
    hostSocket: HOST,
    players: JSON.stringify([HOST, GUEST]),
    numRows: '9',
    numCols: '9',
    numMines: '10',
    ...extra,
});

beforeEach(async () => {
    client = await redisClient;
    jest.clearAllMocks();
    stored = {};
    client.hSet.mockResolvedValue(1);
    client.hGet.mockImplementation(async (key, field) => {
        if (field === 'name') return key.includes(HOST) ? 'Host' : 'Guest';
        if (field === 'players') return JSON.stringify([HOST, GUEST]);
        return null;
    });
    client.hGetAll.mockImplementation(async (key) =>
        key.startsWith('room:') ? lobbyRoom() : { name: 'Host', score: '0' }
    );
});

describe('startPvpGame', () => {
    test('gives both players byte-identical boards', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });

        const fields = roomFields();
        expect(fields.player1Board).toBeDefined();
        expect(fields.player1Board).toBe(fields.player2Board);
    });

    test('the shared board has the requested number of mines', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });

        const board = JSON.parse(roomFields().player1Board);
        expect(board.flat().filter((c) => c.isMine)).toHaveLength(10);
    });

    test('opens a shared starting cell, so neither player can lose on move one', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });

        const board = JSON.parse(roomFields().player1Board);
        const centre = board[4][4];
        expect(centre.isOpen).toBe(true);
        expect(centre.isMine).toBe(false);
        expect(board.flat().filter((c) => c.isOpen).length).toBeGreaterThan(0);
    });

    test('never opens a mine as part of the opening', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });

        const board = JSON.parse(roomFields().player1Board);
        expect(board.flat().filter((c) => c.isOpen && c.isMine)).toHaveLength(0);
    });

    test('both players start on level progress, matching the opening', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });

        const fields = roomFields();
        const opened = JSON.parse(fields.player1Board).flat().filter((c) => c.isOpen).length;
        expect(fields.player1Progress).toBe(String(opened));
        expect(fields.player2Progress).toBe(String(opened));
    });

    test('marks both boards initialised, since nothing is generated later', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });

        const fields = roomFields();
        expect(fields.player1Initialized).toBe('true');
        expect(fields.player2Initialized).toBe('true');
    });

    test('the board sent to players carries no mine positions', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });

        const sent = mockEmit.mock.calls.filter((c) => c[0] === 'pvpBoardUpdate').map((c) => c[1].board);
        expect(sent.length).toBe(2);
        for (const board of sent) {
            expect(board.flat().some((c) => c.isMine)).toBe(false);
        }
        // ...and both players are sent the same thing
        expect(JSON.stringify(sent[0])).toBe(JSON.stringify(sent[1]));
    });

    test('keeps a pristine copy for later resets', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });

        const fields = roomFields();
        expect(fields.sharedBoard).toBe(fields.player1Board);
        expect(parseInt(fields.sharedOpenedCells, 10)).toBeGreaterThan(0);
    });
});

describe('resetMyBoard', () => {
    const startedRoom = (sharedBoard, opened) => ({
        mode: 'pvp',
        pvpStarted: 'true',
        winnerSocket: '',
        players: JSON.stringify([HOST, GUEST]),
        numRows: '9',
        numCols: '9',
        numMines: '10',
        sharedBoard,
        sharedOpenedCells: String(opened),
    });

    /**
     * Plays a real startPvpGame, then re-points the mocks at the room it
     * produced, so a reset runs against a genuine shared board rather than a
     * hand-written one.
     */
    const arrangeReset = async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, isValid, io });
        const started = roomFields();
        const shared = started.sharedBoard;
        const opened = parseInt(started.sharedOpenedCells, 10);

        jest.clearAllMocks();
        client.hSet.mockResolvedValue(1);
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:') ? startedRoom(shared, opened) : { name: 'Host', score: '0', pvpPlayerIndex: '0' }
        );
        client.hGet.mockImplementation(async () => null);

        return { shared, opened };
    };

    /**
     * REGRESSION. Hitting a mine stops that player's clock (pvp.js `stopFor`),
     * and a retry puts them straight back into the race — so the clock has to
     * restart. It did not, and their timer sat frozen at the moment they died
     * for the rest of the game while they kept playing.
     */
    test('restarts this player\'s clock from the room\'s shared start', async () => {
        await arrangeReset();
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:')
                ? { ...startedRoom('[]', 0), sharedBoard: JSON.stringify([[]]), startedAt: '1000' }
                : { name: 'Host', score: '0', pvpPlayerIndex: '0' }
        );

        await resetMyBoard({ socket: { id: HOST }, room: ROOM, isValid, io });

        const clocks = mockEmit.mock.calls.filter(([event]) => event === 'gameClock');
        expect(clocks).toHaveLength(1);
        expect(clocks[0][1]).toEqual({ startedAt: 1000, endedAt: null });
    });

    test('restores the shared starting position, not a blank grid', async () => {
        const { shared, opened } = await arrangeReset();

        await resetMyBoard({ socket: { id: HOST }, room: ROOM, isValid, io });

        const fields = roomFields();
        expect(fields.player1Board).toBe(shared);
        expect(fields.player1Initialized).toBe('true');
        expect(fields.player1Progress).toBe(String(opened));
    });

    /**
     * REGRESSION. This handler used to build the opponent's progress payload from
     * undeclared `numRows`/`numCols`. The ReferenceError landed in the handler's
     * own catch, so the board restore above still passed while everything after
     * it silently never ran: the opponent was never told about the reset and
     * their view of this player's progress bar stayed frozen at the pre-reset
     * value. The board write happens BEFORE the throw, which is exactly why
     * asserting on it alone did not notice.
     *
     * The `console.error` assertion is the load-bearing one — it is what fails if
     * anything in here throws into that catch again.
     */
    test('tells the opponent the reset happened, and what the progress now is', async () => {
        const { opened } = await arrangeReset();
        const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

        await resetMyBoard({ socket: { id: HOST }, room: ROOM, isValid, io });

        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();

        expect(mockTo).toHaveBeenCalledWith(GUEST);
        expect(mockEmit).toHaveBeenCalledWith('pvpOpponentReset');

        // 9x9 with 10 mines, so 71 safe cells.
        const totalSafeCells = 9 * 9 - 10;
        const progress = mockEmit.mock.calls.find((c) => c[0] === 'pvpOpponentProgress');
        expect(progress).toBeDefined();
        expect(progress[1]).toEqual({
            progress: opened,
            totalSafeCells,
            percentage: Math.round((opened / totalSafeCells) * 100),
        });
    });
});

describe('pvpRematch', () => {
    test('deals a fresh board that is still identical for both', async () => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:')
                ? lobbyRoom({ pvpStarted: 'true', player1Socket: HOST, player2Socket: GUEST })
                : { name: 'Host', score: '0' }
        );

        await pvpRematch({ socket: { id: HOST }, room: ROOM, isValid, io });

        const fields = roomFields();
        expect(fields.player1Board).toBe(fields.player2Board);
        expect(JSON.parse(fields.player1Board).flat().filter((c) => c.isMine)).toHaveLength(10);
        expect(fields.player1Progress).toBe(fields.player2Progress);
    });
});
