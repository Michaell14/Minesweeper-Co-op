const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();
const mockSockets = new Map();
const mockEmit = jest.fn();

jest.mock('../utils/initializeRedisClient', () => ({ redisClient: Promise.resolve(mockRedis) }));
jest.mock('../utils/initializeClient', () => ({
    io: { to: jest.fn(() => ({ emit: mockEmit })), sockets: { sockets: mockSockets } },
    server: {},
}));

const { io } = require('../utils/initializeClient');
const { create, join } = require('../routes/room');
const { removePlayer } = require('../utils/playerUtils');
const { SERVER_EVENTS } = require('../../shared/events');

const socketFor = (id) => {
    const socket = {
        id, connected: true, handshake: { auth: {} },
        emit: jest.fn(), join: jest.fn(), leave: jest.fn(),
        to: jest.fn(() => ({ emit: jest.fn() })),
    };
    mockSockets.set(id, socket);
    return socket;
};

const createFor = (socket, numRows = 9) => create({ socket, io, payload: {
    room: 'concurrent-room', name: socket.id, mode: 'co-op',
    numRows, numCols: numRows, numMines: 10,
} });
const joinFor = (socket) => join({ socket, io, payload: { room: 'concurrent-room', name: socket.id } });
const players = () => JSON.parse(mockRedis.read('room:concurrent-room').players);

beforeEach(() => {
    mockRedis.flush();
    mockSockets.clear();
    jest.clearAllMocks();
});

test('simultaneous creators cannot overwrite the same room', async () => {
    const alice = socketFor('Alice');
    const bob = socketFor('Bob');
    await Promise.all([createFor(alice), createFor(bob, 16)]);

    const rejected = [alice, bob].filter((socket) =>
        socket.emit.mock.calls.some(([event]) => event === SERVER_EVENTS.CREATE_ROOM_ERROR));
    expect(rejected).toHaveLength(1);
    const creator = rejected[0] === alice ? bob : alice;
    expect(players()).toEqual([creator.id]);
    expect(rejected[0].join).not.toHaveBeenCalled();
    expect(mockRedis.read('room:concurrent-room').numRows).toBe(creator === alice ? '9' : '16');
});

test('simultaneous co-op arrivals both remain in the roster', async () => {
    await createFor(socketFor('Host'));
    await Promise.all([joinFor(socketFor('Alice')), joinFor(socketFor('Bob'))]);

    expect(players().sort()).toEqual(['Alice', 'Bob', 'Host']);
    for (const id of players()) expect(mockRedis.read(`player:${id}`).room).toBe('concurrent-room');
});

test('an arrival and departure cannot overwrite each other', async () => {
    const host = socketFor('Host');
    await createFor(host);
    await joinFor(socketFor('Alice'));
    await Promise.all([joinFor(socketFor('Bob')), removePlayer(host, host.id)]);

    expect(players().sort()).toEqual(['Alice', 'Bob']);
    expect(mockRedis.read('player:Host')).toEqual({});
});

test('simultaneous departures remove both players from the roster', async () => {
    const host = socketFor('Host');
    const alice = socketFor('Alice');
    await createFor(host);
    await joinFor(alice);
    await joinFor(socketFor('Bob'));
    await Promise.all([removePlayer(host, host.id), removePlayer(alice, alice.id)]);

    expect(players()).toEqual(['Bob']);
    expect(mockRedis.read('player:Host')).toEqual({});
    expect(mockRedis.read('player:Alice')).toEqual({});
});

test.each(['co-op', 'pvp'])('an expired %s room is not recreated by a waiting join', async (mode) => {
    await createFor(socketFor('Host'));
    const roomRepo = require('../data/roomRepo');
    await roomRepo.setFields('concurrent-room', { mode });
    const originalLock = roomRepo.withJoinLock;
    const lock = jest.spyOn(roomRepo, 'withJoinLock').mockImplementationOnce(async (room, owner, run) => {
        await mockRedis.del(`room:${room}`);
        return originalLock(room, owner, run);
    });
    const arrival = socketFor('Arrival');

    await joinFor(arrival);

    expect(arrival.emit).toHaveBeenCalledWith(SERVER_EVENTS.JOIN_ROOM_ERROR);
    expect(mockRedis.read('room:concurrent-room')).toEqual({});
    expect(mockRedis.read('player:Arrival')).toEqual({});
    lock.mockRestore();
});
