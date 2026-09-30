/** Lifecycle requests must make their decisions inside the board locks. */
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

const { startPvpGame, resetMyBoard, pvpRematch } = require('../controllers/pvpController');
const roomRepo = require('../data/roomRepo');
const { toggleFlag } = require('../game');

const ROOM = 'lifecycle';
const HOST = 'host';
const GUEST = 'guest';
const io = { to: mockTo };
const hostRequest = { socket: { id: HOST }, room: ROOM, io };
const events = (name) => mockEmit.mock.calls.filter(([event]) => event === name);
const storedRoom = () => mockRedis.read(`room:${ROOM}`);

const seedLobby = () => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'pvp', pvpStarted: 'false', hostSocket: HOST,
        players: JSON.stringify([HOST, GUEST]),
        player1Socket: '', player2Socket: '',
        numRows: '9', numCols: '9', numMines: '10', winnerSocket: '',
    });
    for (const id of [HOST, GUEST]) {
        mockRedis.seed(`player:${id}`, { room: ROOM, name: id, score: '0' });
    }
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Start a request behind a held board lock, then change the state it will read. */
const whileResetWaits = async (change) => {
    let release;
    let locked;
    const acquired = new Promise((resolve) => { locked = resolve; });
    const unblock = new Promise((resolve) => { release = resolve; });
    const holder = roomRepo.withPvpActionLock(ROOM, 0, 'in-flight-move', async () => {
        locked();
        await unblock;
    });
    await acquired;
    const attempts = mockRedis.locksTaken().length;
    const reset = resetMyBoard(hostRequest);
    while (mockRedis.locksTaken().length === attempts) await tick();
    await change();
    release();
    await Promise.all([holder, reset]);
};

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
    seedLobby();
});

test('two overlapping start requests start one race', async () => {
    await Promise.all([startPvpGame(hostRequest), startPvpGame(hostRequest)]);

    expect(events('pvpGameStarted')).toHaveLength(1);
    expect(events('pvpBoardUpdate')).toHaveLength(2);
});

test('two overlapping rematches cannot deal the players two different new races', async () => {
    await startPvpGame(hostRequest);
    await roomRepo.setFields(ROOM, { winnerSocket: HOST, player1GameWon: 'true' });
    jest.clearAllMocks();

    await Promise.all([pvpRematch(hostRequest), pvpRematch(hostRequest)]);

    expect(events('pvpRematchStarted')).toHaveLength(2);
    expect(events('pvpBoardUpdate')).toHaveLength(2);
});

test('a rematch requested from an unstarted lobby assigns both playable slots', async () => {
    await pvpRematch(hostRequest);

    expect(storedRoom().player1Socket).toBe(HOST);
    expect(storedRoom().player2Socket).toBe(GUEST);
    expect(mockRedis.read(`player:${HOST}`).pvpPlayerIndex).toBe('0');
    expect(mockRedis.read(`player:${GUEST}`).pvpPlayerIndex).toBe('1');
    const board = JSON.parse(storedRoom().player1Board);
    let next;
    board.forEach((row, r) => row.forEach((cell, c) => {
        if (!cell.isOpen) next = [r, c];
    }));
    expect(next).toBeDefined();
    await toggleFlag(...next, ROOM, HOST);
    expect(JSON.parse(storedRoom().player1Board)[next[0]][next[1]].isFlagged).toBe(true);
});

test('a reset queued behind the winning move cannot restart a decided race', async () => {
    await startPvpGame(hostRequest);
    const board = storedRoom().player1Board;
    jest.clearAllMocks();

    await whileResetWaits(() => roomRepo.setFields(ROOM, {
        winnerSocket: HOST, player1GameWon: 'true', player1Progress: '71',
    }));

    expect(storedRoom().player1Progress).toBe('71');
    expect(storedRoom().player1Board).toBe(board);
    expect(events('pvpBoardUpdate')).toHaveLength(0);
    expect(events('gameClock')).toHaveLength(0);
});

test('a queued reset restores the current race, not an older shared board', async () => {
    await startPvpGame(hostRequest);
    const newerBoard = JSON.parse(storedRoom().sharedBoard);
    newerBoard[0][0].isOpen = !newerBoard[0][0].isOpen;
    const serialized = JSON.stringify(newerBoard);
    jest.clearAllMocks();

    await whileResetWaits(() => roomRepo.setFields(ROOM, {
        sharedBoard: serialized, sharedOpenedCells: '7', startedAt: '12345',
    }));

    expect(storedRoom().player1Board).toBe(serialized);
    expect(storedRoom().player1Progress).toBe('7');
    expect(events('gameClock')[0][1]).toEqual({ startedAt: 12345, endedAt: null });
});

test('a rematch waits until a reconnect has finished restoring its old snapshot', async () => {
    await startPvpGame(hostRequest);
    await roomRepo.setFields(ROOM, { winnerSocket: GUEST, player2GameWon: 'true' });
    let release;
    let locked;
    const acquired = new Promise((resolve) => { locked = resolve; });
    const unblock = new Promise((resolve) => { release = resolve; });
    const reconnect = roomRepo.withJoinLock(ROOM, GUEST, async () => {
        locked();
        await unblock;
        // The returning winner rewrites its old socket identity during restore.
        await roomRepo.setFields(ROOM, { winnerSocket: 'guest-returned', player2Socket: 'guest-returned',
            players: JSON.stringify([HOST, 'guest-returned']) });
        mockRedis.seed('player:guest-returned', { room: ROOM, name: 'Guest', score: '0' });
    });
    await acquired;
    jest.clearAllMocks();
    const attempts = mockRedis.locksTaken().length;
    const rematch = pvpRematch(hostRequest);
    while (mockRedis.locksTaken().length === attempts) await tick();
    expect(events('pvpRematchStarted')).toHaveLength(0);
    release();
    await Promise.all([reconnect, rematch]);

    expect(storedRoom().winnerSocket).toBe('');
    expect(storedRoom().player2Socket).toBe('guest-returned');
    expect(events('pvpRematchStarted')).toHaveLength(2);
});
