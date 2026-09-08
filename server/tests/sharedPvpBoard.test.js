/**
 * PVP players race one identical board. Boards used to be generated lazily
 * around each player's first click, which is why the two differed. Now
 * startPvpGame builds one no-guess board around a shared start cell, opens
 * it, and hands the same thing to both, so nobody can lose on move one.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const { startPvpGame, resetMyBoard, pvpRematch } = require('../controllers/pvpController');
const { redisClient } = require('../utils/initializeRedisClient');
const { lockedBy, releasedLock } = require('./setup/lockAssertions');

const ROOM = 'r1';
const HOST = 'sock-host';
const GUEST = 'sock-guest';

let client;
let stored;

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
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });

        const fields = roomFields();
        expect(fields.player1Board).toBeDefined();
        expect(fields.player1Board).toBe(fields.player2Board);
    });

    test('the shared board has the requested number of mines', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });

        const board = JSON.parse(roomFields().player1Board);
        expect(board.flat().filter((c) => c.isMine)).toHaveLength(10);
    });

    test('opens a shared starting cell, so neither player can lose on move one', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });

        const board = JSON.parse(roomFields().player1Board);
        const centre = board[4][4];
        expect(centre.isOpen).toBe(true);
        expect(centre.isMine).toBe(false);
        expect(board.flat().filter((c) => c.isOpen).length).toBeGreaterThan(0);
    });

    test('never opens a mine as part of the opening', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });

        const board = JSON.parse(roomFields().player1Board);
        expect(board.flat().filter((c) => c.isOpen && c.isMine)).toHaveLength(0);
    });

    test('both players start on level progress, matching the opening', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });

        const fields = roomFields();
        const opened = JSON.parse(fields.player1Board).flat().filter((c) => c.isOpen).length;
        expect(fields.player1Progress).toBe(String(opened));
        expect(fields.player2Progress).toBe(String(opened));
    });

    test('marks both boards initialised, since nothing is generated later', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });

        const fields = roomFields();
        expect(fields.player1Initialized).toBe('true');
        expect(fields.player2Initialized).toBe('true');
    });

    test('the board sent to players carries no mine positions', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });

        const sent = mockEmit.mock.calls.filter((c) => c[0] === 'pvpBoardUpdate').map((c) => c[1].board);
        expect(sent.length).toBe(2);
        for (const board of sent) {
            expect(board.flat().some((c) => c.isMine)).toBe(false);
        }
        // ...and both players are sent the same thing
        expect(JSON.stringify(sent[0])).toBe(JSON.stringify(sent[1]));
    });

    test('keeps a pristine copy for later resets', async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });

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

    /** Plays a real startPvpGame, then re-points the mocks at the room it produced. */
    const arrangeReset = async () => {
        await startPvpGame({ socket: { id: HOST }, room: ROOM, io });
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
     * REGRESSION. A mine stops that player's clock (pvp.js `stopFor`) and a
     * retry puts them back in the race, so the clock has to restart. It did not.
     */
    test('restarts this player\'s clock from the room\'s shared start', async () => {
        await arrangeReset();
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:')
                ? { ...startedRoom('[]', 0), sharedBoard: JSON.stringify([[]]), startedAt: '1000' }
                : { name: 'Host', score: '0', pvpPlayerIndex: '0' }
        );

        await resetMyBoard({ socket: { id: HOST }, room: ROOM, io });

        const clocks = mockEmit.mock.calls.filter(([event]) => event === 'gameClock');
        expect(clocks).toHaveLength(1);
        expect(clocks[0][1]).toEqual({ startedAt: 1000, endedAt: null });
    });

    test('restores the shared starting position, not a blank grid', async () => {
        const { shared, opened } = await arrangeReset();

        await resetMyBoard({ socket: { id: HOST }, room: ROOM, io });

        const fields = roomFields();
        expect(fields.player1Board).toBe(shared);
        expect(fields.player1Initialized).toBe('true');
        expect(fields.player1Progress).toBe(String(opened));
    });

    /**
     * REGRESSION. This built the opponent's payload from undeclared
     * `numRows`/`numCols`; the ReferenceError landed in the handler's own catch
     * after the board write, so asserting on the board alone passed. The
     * `console.error` assertion is the load-bearing one.
     */
    test('tells the opponent the reset happened, and what the progress now is', async () => {
        const { opened } = await arrangeReset();
        const errors = jest.spyOn(console, 'error').mockImplementation(() => {});

        await resetMyBoard({ socket: { id: HOST }, room: ROOM, io });

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

    test('restores the board under that player\'s action lock, and gives it back', async () => {
        await arrangeReset();

        await resetMyBoard({ socket: { id: HOST }, room: ROOM, io });

        expect(client.set).toHaveBeenCalledWith(`action_lock:${ROOM}:p0`, lockedBy(HOST), { NX: true, EX: 5 });
        expect(releasedLock(client, `action_lock:${ROOM}:p0`)).toBe(true);
    });

    test('locks the player who asked, not always player one', async () => {
        await arrangeReset();
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:')
                ? startedRoom(JSON.stringify([[]]), 0)
                : { name: 'Guest', score: '0', pvpPlayerIndex: '1' }
        );

        await resetMyBoard({ socket: { id: GUEST }, room: ROOM, io });

        expect(client.set).toHaveBeenCalledWith(`action_lock:${ROOM}:p1`, lockedBy(GUEST), { NX: true, EX: 5 });
        expect(roomFields().player2Board).toBeDefined();
        expect(roomFields().player1Board).toBeUndefined();
    });

    /**
     * REGRESSION. `pvpPlayerIndex || '0'` sent an unassigned socket to index 0,
     * resetting PLAYER ONE's board under player one's lock.
     */
    test('an unassigned socket resets nobody\'s board', async () => {
        await arrangeReset();
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:')
                ? startedRoom(JSON.stringify([[]]), 0)
                : { name: 'Stranger', score: '0' }   // no pvpPlayerIndex
        );

        await resetMyBoard({ socket: { id: 'sock-stranger' }, room: ROOM, io });

        expect(roomFields()).toEqual({});
        expect(client.set).not.toHaveBeenCalledWith(
            expect.stringContaining('action_lock:'), expect.anything(), expect.anything()
        );
    });
});

describe('pvpRematch', () => {
    /** A FINISHED race; a rematch is refused while one is live. `winnerSocket` marks it settled. */
    const arrangeRematch = (extra = {}) => {
        client.hGetAll.mockImplementation(async (key) =>
            key.startsWith('room:')
                ? lobbyRoom({
                    pvpStarted: 'true',
                    player1Socket: HOST,
                    player2Socket: GUEST,
                    winnerSocket: GUEST,
                    ...extra,
                })
                : { name: 'Host', score: '0' }
        );
    };

    test('deals a fresh board that is still identical for both', async () => {
        arrangeRematch();

        await pvpRematch({ socket: { id: HOST }, room: ROOM, io });

        const fields = roomFields();
        expect(fields.player1Board).toBe(fields.player2Board);
        expect(JSON.parse(fields.player1Board).flat().filter((c) => c.isMine)).toHaveLength(10);
        expect(fields.player1Progress).toBe(fields.player2Progress);
    });

    test('holds BOTH players\' action locks, since it rewrites both boards', async () => {
        arrangeRematch();

        await pvpRematch({ socket: { id: HOST }, room: ROOM, io });

        expect(client.set).toHaveBeenCalledWith(`action_lock:${ROOM}:p0`, lockedBy(HOST), { NX: true, EX: 5 });
        expect(client.set).toHaveBeenCalledWith(`action_lock:${ROOM}:p1`, lockedBy(HOST), { NX: true, EX: 5 });
        expect(releasedLock(client, `action_lock:${ROOM}:p0`)).toBe(true);
        expect(releasedLock(client, `action_lock:${ROOM}:p1`)).toBe(true);
    });

    /**
     * Deadlock freedom rests on this: a move holds only its own lock, so the
     * only possible cycle is two multi-lock callers disagreeing on the order.
     */
    test('takes them in index order, p0 before p1', async () => {
        arrangeRematch();

        await pvpRematch({ socket: { id: HOST }, room: ROOM, io });

        const locked = client.set.mock.calls
            .map((c) => c[0])
            .filter((key) => key.startsWith(`action_lock:${ROOM}:`));
        expect(locked).toEqual([`action_lock:${ROOM}:p0`, `action_lock:${ROOM}:p1`]);
    });

    /*
     * The Rematch button only appears once a winner exists. Ungated, a host
     * could rebuild both boards out from under a race they were losing.
     */
    test('is refused while the race is still undecided', async () => {
        arrangeRematch({ winnerSocket: '' });

        await pvpRematch({ socket: { id: HOST }, room: ROOM, io });

        expect(roomFields()).toEqual({});
    });

    test('a race nobody has started yet is not a race to protect', async () => {
        // Equivalent to startPvpGame; nothing is in flight, so nothing is lost.
        arrangeRematch({ pvpStarted: 'false', winnerSocket: '' });

        await pvpRematch({ socket: { id: HOST }, room: ROOM, io });

        expect(roomFields().player1Board).toBeDefined();
    });

    test('writes both boards while both locks are held', async () => {
        arrangeRematch();

        await pvpRematch({ socket: { id: HOST }, room: ROOM, io });

        // Spelled out so the comparisons cannot pass on an empty set (Math.max()
        // of nothing is -Infinity). Releases are `eval`; see setup/lockAssertions.js.
        expect(client.set.mock.invocationCallOrder).toHaveLength(2);
        expect(client.eval.mock.invocationCallOrder).toHaveLength(2);

        const lastAcquire = Math.max(...client.set.mock.invocationCallOrder);
        const firstRelease = Math.min(...client.eval.mock.invocationCallOrder);
        const boardWrite = client.hSet.mock.invocationCallOrder[
            client.hSet.mock.calls.findIndex((c) => c[1] && c[1].player1Board)
        ];

        expect(boardWrite).toBeGreaterThan(lastAcquire);
        expect(boardWrite).toBeLessThan(firstRelease);
    });
});
