/**
 * Global test setup.
 *
 * Almost every server module imports the `io` and Redis singletons at module
 * scope, so requiring anything under utils/ opens a real Redis connection and
 * starts its 60s ping interval — which leaks handles and makes the suite depend
 * on a running Redis. Mocking both here means no test can reach real infra by
 * accident.
 *
 * A test that needs to assert on these (see tests/gameUtils.test.js) can declare
 * its own jest.mock for the same module; the per-file mock wins.
 */

jest.mock('../../utils/initializeRedisClient', () => ({
    redisClient: Promise.resolve({
        hGet: jest.fn(),
        hGetAll: jest.fn(),
        hSet: jest.fn(),
        exists: jest.fn(),
        del: jest.fn(),
        // Locks are taken with SET NX, and a bare jest.fn() reports every one as
        // LOST. Co-op moves then sit in withActionLock's retry loop until its
        // wait is exhausted, which reads as an unexplained multi-second hang in
        // any test that never mentions locking. 'OK' — the lock was free — is
        // the ordinary case; tests about contention override it.
        set: jest.fn(async () => 'OK'),
        // withLock's ownership-checked release. Like `set` above, the useful
        // default is the ordinary case — the lock was still ours — since a
        // bare jest.fn() here just returns undefined and asserts nothing.
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
    io: { to: jest.fn(() => ({ emit: jest.fn() })), use: jest.fn() },
    server: { listen: jest.fn() },
}));

/*
 * Postgres is OPTIONAL in production — no DATABASE_URL means account features
 * are off and the game runs untouched — and that is also the right default
 * here: no test reaches a real database by accident, and code exercising a
 * best-effort stats write sees exactly the "not configured" failure a
 * database-less deploy produces. Tests about Postgres-backed repos declare a
 * per-file mock with canned rows, same as the Redis pattern above.
 */
jest.mock('../../utils/initializePgClient', () => ({
    pgPool: null,
    isDbEnabled: () => false,
    query: jest.fn(async () => {
        throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    }),
}));
