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
        expire: jest.fn(),
        ping: jest.fn(),
        zAdd: jest.fn(),
        zRangeWithScores: jest.fn(),
        zRank: jest.fn(),
        zCard: jest.fn(),
    }),
}));

jest.mock('../../utils/initializeClient', () => ({
    io: { to: jest.fn(() => ({ emit: jest.fn() })) },
    server: { listen: jest.fn() },
}));
