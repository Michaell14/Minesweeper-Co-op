/**
 * Regression for the cached hover guard and name (#171): a hover answered from
 * the cache must not overtake an earlier one still waiting on Redis. When it
 * did, the co-player's last relay was a stale cell, and since the client never
 * expires a cursor, it stuck there.
 *
 * Driven through the real cellHover row against the event-loop Redis fake,
 * with every reply held and released oldest first, which is the order one
 * Redis connection answers in.
 */

const { createFakeRedis } = require('./setup/fakeRedis');
const mockRedis = createFakeRedis();

jest.mock('../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve(mockRedis),
}));

jest.mock('../utils/initializeClient', () => ({
    io: { to: jest.fn(() => ({ emit: jest.fn() })), sockets: { sockets: new Map() } },
    server: {},
}));

const { ROUTES } = require('../routes');
const { wrapRoute } = require('../routes/register');
const { MEMBER_PASS_MS } = require('../routes/guards');
const { CLIENT_EVENTS } = require('../../shared/events');

const ROOM = 'ABCD';
const ALICE = 'sock-a';

/** Holds every Redis reply the guard and name lookup make until released. */
const held = [];
const gate = { on: false };
for (const name of ['hmGet', 'exists', 'hGet', 'hGetAll']) {
    const real = mockRedis[name];
    mockRedis[name] = async (...args) => {
        if (gate.on) await new Promise((resolve) => held.push(resolve));
        return real(...args);
    };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const releaseOldest = async (n) => {
    for (let i = 0; i < n && held.length; i++) {
        held.shift()();
        await settle();
    }
};
const drain = async () => {
    while (held.length) await releaseOldest(1);
    await settle();
};

let clock = 0;
let nowSpy;

beforeEach(() => {
    mockRedis.flush();
    mockRedis.seed(`room:${ROOM}`, {
        mode: 'co-op',
        players: JSON.stringify([ALICE, 'sock-b']),
        numRows: '9',
        numCols: '9',
    });
    mockRedis.seed(`player:${ALICE}`, { name: 'Alice', room: ROOM, score: '0' });
    clock = 0;
    // The admission and name caches expire on this clock, as does the rate limiter.
    nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => clock);
});

afterEach(() => {
    gate.on = false;
    nowSpy.mockRestore();
});

const aliceSocket = () => {
    const relayed = [];
    return {
        id: ALICE,
        data: {},
        rooms: new Set([ALICE, ROOM]),
        handshake: { auth: {} },
        emit: jest.fn(),
        leave: jest.fn(),
        to: () => ({ emit: (event, payload) => relayed.push(payload) }),
        relayed,
    };
};

const hoverRow = () => ROUTES.find((route) => route.event === CLIENT_EVENTS.CELL_HOVER);

test('the cellHover row is serial', () => {
    expect(hoverRow().serial).toBe(true);
});

/*
 * The window that opens every MEMBER_PASS_MS: the admission has just expired
 * and the cached name has not. Two hovers miss and wait on Redis; the first
 * one's replies come back and renew the admission; then Alice's mouse leaves
 * the board, and that clear is admitted from the cache straight away.
 */
test('the last hover Bob is sent is the last one Alice sent', async () => {
    const socket = aliceSocket();
    const send = (row, col) => wrapRoute(hoverRow(), { socket, io: {} })({ room: ROOM, row, col });

    // Warm-up, ungated: the admission is stamped at 0 and the name a moment later.
    const warm = send(0, 0);
    clock = 5;
    await warm;

    gate.on = true;
    clock = MEMBER_PASS_MS + 1;
    const first = send(1, 1);
    await settle();
    clock += 1;
    const second = send(2, 2);
    await settle();
    await releaseOldest(2);           // the first hover's membership replies
    clock += 1;
    const clear = send(-1, -1);       // Alice leaves the board
    await settle();
    await drain();
    await Promise.all([first, second, clear]);

    expect(socket.relayed.map(({ row, col }) => `${row},${col}`)).toEqual(['0,0', '1,1', '2,2', '-1,-1']);
});
