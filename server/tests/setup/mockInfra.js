/**
 * Global test setup. Almost every server module imports the `io` and Redis
 * singletons at module scope, so requiring anything under utils/ would open a
 * real Redis connection and leak its ping interval. A test that needs to
 * assert on these declares its own jest.mock (see tests/gameUtils.test.js).
 */

jest.mock('../../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve({
        hGet: jest.fn(),
        hmGet: jest.fn(),
        hGetAll: jest.fn(),
        hSet: jest.fn(),
        hDel: jest.fn(),
        exists: jest.fn(),
        del: jest.fn(),
        // Locks are SET NX; a bare jest.fn() reports every one as LOST, and
        // co-op moves then hang in withActionLock's retry loop. 'OK' is the
        // ordinary case; tests about contention override it.
        set: jest.fn(async () => 'OK'),
        // withLock's ownership-checked release; the ordinary case is that the lock was still ours.
        eval: jest.fn(async () => 1),
        expire: jest.fn(),
        ping: jest.fn(),
        zAdd: jest.fn(),
        zRangeWithScores: jest.fn(),
        zRank: jest.fn(),
        zCard: jest.fn(),
    }),
}));

jest.mock('../../utils/initializeClient', () => ({
    app: { use: jest.fn(), get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    // `sockets.sockets` is socket.io's live connection map, which matchmaking
    // reads; an empty map is the honest default.
    io: { to: jest.fn(() => ({ emit: jest.fn() })), use: jest.fn(), sockets: { sockets: new Map() } },
    server: { listen: jest.fn() },
}));

/*
 * Postgres is OPTIONAL in production (no DATABASE_URL means account features
 * are off), so it is the right default here: a best-effort stats write sees
 * the same "not configured" failure. Postgres-backed repo tests declare a
 * per-file mock with canned rows.
 */
jest.mock('../../utils/initializePgClient', () => ({
    pgPool: null,
    isDbEnabled: () => false,
    query: jest.fn(async () => {
        throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    }),
}));
