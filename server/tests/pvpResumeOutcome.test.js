/** A completed race must restore the loser's own outcome as well as the winner. */
const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo }, server: {},
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();
jest.mock('../utils/initializeRedisClient', () => ({ redisClient: Promise.resolve(mockRedis) }));

const { openCell } = require('../game');
const { resetMyBoard } = require('../controllers/pvpController');
const { addPlayerToRoom, removePlayer } = require('../utils/playerUtils');
const roomRepo = require('../data/roomRepo');

const ROOM = 'resume-outcome';
const RACER = 'racer';
const RETURNED = 'racer-returned';
const RIVAL = 'rival';
const SESSION = 'racer-session';

const emittedTo = (target, event) => mockEmit.mock.calls.flatMap(([name, payload], i) =>
    name === event && mockTo.mock.calls[i][0] === target ? [payload] : []);

beforeEach(() => {
    mockRedis.flush();
    jest.clearAllMocks();
    // Both racers are one safe cell from a clear. The other closed cell is a mine.
    const board = [[
        { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 },
        { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
    ], [
        { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
        { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 },
    ]];
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'pvp', pvpStarted: 'true', hostSocket: RACER,
        numRows: '2', numCols: '2', numMines: '1', totalSafeCells: '3',
        players: JSON.stringify([RACER, RIVAL]), startedAt: '1000', winnerSocket: '',
        player1Socket: RACER, player2Socket: RIVAL,
        player1Board: JSON.stringify(board), player2Board: JSON.stringify(board),
        player1Initialized: 'true', player2Initialized: 'true',
        player1GameOver: 'false', player2GameOver: 'false',
        player1GameWon: 'false', player2GameWon: 'false',
        player1Progress: '2', player2Progress: '2',
        sharedBoard: JSON.stringify(board), sharedOpenedCells: '2',
    });
    mockRedis.seed(`player:${RACER}`, {
        room: ROOM, name: 'Racer', score: '0', pvpPlayerIndex: '0', sessionId: SESSION,
    });
    mockRedis.seed(`player:${RIVAL}`, { room: ROOM, name: 'Rival', score: '0', pvpPlayerIndex: '1' });
    mockRedis.seed(`session:${SESSION}`, { room: ROOM, name: 'Racer', socketId: RACER });
});

test.each([false, true])('mine hit → reset=%s → rival wins → reconnect restores the current mine-hit state', async (reset) => {
    await openCell(0, 0, ROOM, RACER);
    expect(mockRedis.read(`room:${ROOM}`).player1GameOver).toBe('true');

    if (reset) {
        await resetMyBoard({ socket: { id: RACER }, room: ROOM, io: { to: mockTo } });
        expect(mockRedis.read(`room:${ROOM}`).player1GameOver).toBe('false');
    }
    await openCell(1, 1, ROOM, RIVAL);
    expect(mockRedis.read(`room:${ROOM}`).winnerSocket).toBe(RIVAL);

    await removePlayer({ leave: jest.fn(), to: () => ({ emit: jest.fn() }) }, RACER);
    expect(mockRedis.read(`player:${RACER}`)).toEqual({});
    jest.clearAllMocks();
    await roomRepo.withJoinLock(ROOM, RETURNED, () =>
        addPlayerToRoom(ROOM, RETURNED, 'Racer', SESSION));

    const [snapshot] = emittedTo(RETURNED, 'pvpBoardUpdate');
    expect(snapshot.gameOver).toBe(!reset);
    expect(snapshot.board[0][0]).toMatchObject({ isMine: true, isOpen: !reset });
    expect(emittedTo(RETURNED, 'pvpPlayerWon')).toEqual([{
        winnerSocket: RIVAL, winnerName: 'Rival', replay: true,
    }]);
    // Snapshot restoration does not open a second, outdated mine-hit dialog.
    expect(emittedTo(RETURNED, 'pvpGameOver')).toEqual([]);
});
