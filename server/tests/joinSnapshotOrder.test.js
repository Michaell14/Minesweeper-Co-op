/** A terminal replay files a best time immediately, so metadata must precede it. */
const mockEvents = [];
const mockTo = jest.fn((target) => ({
    emit: (event, payload) => mockEvents.push({ target, event, payload }),
}));

jest.mock('../utils/initializeClient', () => ({
    io: { to: mockTo },
    server: {},
}));

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();
jest.mock('../utils/initializeRedisClient', () => ({ redisClient: Promise.resolve(mockRedis) }));

const { join } = require('../routes/room');
const ROOM = 'finished-room';
const PLAYER = 'arrival';

beforeEach(() => {
    mockRedis.flush();
    mockEvents.length = 0;
    jest.clearAllMocks();
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'co-op', initialized: 'true', gameWon: 'true', gameOver: 'false',
        numRows: '2', numCols: '2', numMines: '1',
        startedAt: '1000', endedAt: '2400', players: JSON.stringify(['teammate']),
        board: JSON.stringify([
            [{ isMine: true, isOpen: false, isFlagged: true, nearbyMines: 0 },
                { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }],
            [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 },
                { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }],
        ]),
    });
    mockRedis.seed('player:teammate', { room: ROOM, name: 'Teammate', score: '3' });
});

test('publishes dimensions, final clock, board and group size before replaying the win', async () => {
    const socket = {
        id: PLAYER, handshake: { auth: {} }, join: jest.fn(), leave: jest.fn(),
        emit: (event, payload) => mockEvents.push({ target: PLAYER, event, payload }),
    };

    await join({ socket, io: { to: mockTo }, payload: { room: ROOM, name: 'Arrival' } });

    const winIndex = mockEvents.findIndex(({ event }) => event === 'gameWon');
    expect(winIndex).toBeGreaterThan(-1);
    expect(mockEvents[winIndex].payload).toEqual({ replay: true });
    for (const event of ['joinRoomSuccess', 'gameClock', 'boardUpdate', 'playerStatsUpdate']) {
        const index = mockEvents.findIndex((sent) => sent.event === event);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(winIndex);
    }
    expect(mockEvents.find(({ event }) => event === 'joinRoomSuccess').payload).toMatchObject({
        numRows: 2, numCols: 2, numMines: 1,
    });
    expect(mockEvents.find(({ event }) => event === 'gameClock').payload).toEqual({ startedAt: 1000, endedAt: 2400 });
    expect(mockEvents.find(({ event }) => event === 'playerStatsUpdate').payload).toHaveLength(2);
});
