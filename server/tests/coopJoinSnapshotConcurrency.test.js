/** A paused terminal join must not publish its old board/outcome after reset. */
const mockEvents = [];
const mockTo = jest.fn((target) => ({
    emit: (event, payload) => mockEvents.push({ target, event, payload }),
}));
jest.mock('../utils/initializeClient', () => ({ io: { to: mockTo }, server: {} }));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();
jest.mock('../utils/initializeRedisClient', () => ({ redisClient: Promise.resolve(mockRedis) }));

const roomRepo = require('../data/roomRepo');
const { actionLockKey } = require('../data/keys');
const { join } = require('../routes/room');
const { resetGame } = require('../utils/gameUtils');
const { projectBoard } = require('../domain/board');
const { SERVER_EVENTS: E } = require('../../shared/events');

const ROOM = 'finished-room';
const PLAYER = 'arrival';
const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
};

beforeEach(() => {
    mockRedis.flush();
    mockEvents.length = 0;
    jest.clearAllMocks();
});
afterEach(() => jest.restoreAllMocks());

test.each([
    ['won', 2], ['lost', 2],
    ['won', 3], ['lost', 3],
])('a %s snapshot cannot follow a reset paused at room read %s', async (outcome, pauseAt) => {
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'co-op', relaxed: 'true', livesRemaining: outcome === 'won' ? '2' : '0',
        initialized: 'true', gameWon: String(outcome === 'won'), gameOver: String(outcome === 'lost'),
        gameOverName: outcome === 'lost' ? 'Teammate' : '',
        numRows: '2', numCols: '2', numMines: '1', startedAt: '1000', endedAt: '2400',
        players: JSON.stringify(['teammate']),
        board: JSON.stringify([
            [{ isMine: true, isOpen: false, isFlagged: true, nearbyMines: 0 },
                { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }],
            [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
                { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }],
        ]),
    });
    mockRedis.seed('player:teammate', { room: ROOM, name: 'Teammate', score: '3' });

    const snapshotRead = deferred();
    const releaseSnapshot = deferred();
    const getState = roomRepo.getState;
    let reads = 0;
    jest.spyOn(roomRepo, 'getState').mockImplementation(async (room) => {
        const snapshot = await getState(room);
        // Pause either the pre-lock membership snapshot or the protected
        // publication snapshot: re-reading and holding through send both matter.
        if (room === ROOM && ++reads === pauseAt) {
            snapshotRead.resolve();
            await releaseSnapshot.promise;
        }
        return snapshot;
    });

    const resetBlocked = deferred();
    const redisSet = mockRedis.set;
    jest.spyOn(mockRedis, 'set').mockImplementation(async (key, value, options) => {
        const acquired = await redisSet(key, value, options);
        if (key === actionLockKey(ROOM) && !acquired) resetBlocked.resolve();
        return acquired;
    });

    const socket = {
        id: PLAYER, handshake: { auth: {} }, join: jest.fn(), leave: jest.fn(),
        emit: (event, payload) => mockEvents.push({ target: PLAYER, event, payload }),
    };
    const joining = join({ socket, io: { to: mockTo }, payload: { room: ROOM, name: 'Arrival' } });
    await snapshotRead.promise;
    const resetting = resetGame(ROOM);
    try {
        // Without the action lock, reset completes while the stale snapshot is
        // paused. With it, the reset demonstrably waits before we let join run.
        await Promise.race([resetting, resetBlocked.promise]);
    } finally {
        releaseSnapshot.resolve();
    }
    await Promise.all([joining, resetting]);

    const resetIndex = mockEvents.findIndex(({ event }) => event === E.RESET_EVERYONE);
    expect(resetIndex).toBeGreaterThanOrEqual(0);
    expect(mockEvents.slice(resetIndex + 1).filter(({ event }) =>
        event === E.GAME_WON || event === E.GAME_OVER)).toEqual([]);

    const lastPayload = (event) => mockEvents.filter((sent) => sent.event === event).at(-1).payload;
    const stored = mockRedis.read(`room:${ROOM}`);
    expect(lastPayload(E.BOARD_UPDATE)).toEqual(projectBoard(JSON.parse(stored.board)));
    expect(lastPayload(E.GAME_CLOCK)).toEqual({ startedAt: null, endedAt: null });
    expect(lastPayload(E.COOP_LIVES)).toEqual({ room: ROOM, relaxed: true, livesRemaining: 3 });
    expect(stored).toMatchObject({ gameWon: 'false', gameOver: 'false', initialized: 'false' });
});
