/**
 * The Postgres singleton's two modes, exercised against the REAL module
 * (mockInfra's global mock is undone below).
 *
 * The disabled mode matters most: it is what every contributor without
 * Postgres runs in, and what production runs in before the addon is
 * provisioned. It must load cleanly, report the database as absent, and fail
 * queries with a clear error — never crash or hang.
 *
 * Safe without a database: `new Pool` opens no connection until first query,
 * so the enabled-mode tests only inspect configuration.
 */

jest.unmock('../utils/initializePgClient');

/**
 * Loads a fresh copy of the module under a chosen DATABASE_URL. dotenv is
 * stubbed out so a developer's server/.env cannot leak a real DATABASE_URL
 * into the "unset" case and flip its outcome.
 */
const loadWithUrl = (url) => {
    let mod;
    const prev = process.env.DATABASE_URL;
    jest.isolateModules(() => {
        jest.doMock('dotenv', () => ({ config: () => ({}) }));
        if (url === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = url;
        try {
            mod = require('../utils/initializePgClient');
        } finally {
            if (prev === undefined) delete process.env.DATABASE_URL;
            else process.env.DATABASE_URL = prev;
        }
    });
    return mod;
};

describe('without DATABASE_URL', () => {
    test('loads with no pool and reports the database disabled', () => {
        const db = loadWithUrl(undefined);
        expect(db.pgPool).toBeNull();
        expect(db.isDbEnabled()).toBe(false);
    });

    test('query rejects with a clear error instead of hanging', async () => {
        const db = loadWithUrl(undefined);
        await expect(db.query('SELECT 1')).rejects.toThrow(/not configured/);
    });
});

describe('with DATABASE_URL', () => {
    test('local connection strings get no TLS — local Postgres speaks none', async () => {
        const db = loadWithUrl('postgres://user:pass@localhost:5432/minesweeper');
        expect(db.isDbEnabled()).toBe(true);
        expect(db.pgPool.options.ssl).toBe(false);
        await db.pgPool.end();
    });

    test('remote connection strings get TLS without CA verification — the Heroku shape', async () => {
        const db = loadWithUrl('postgres://user:pass@ec2-1-2-3-4.compute-1.amazonaws.com:5432/d1');
        expect(db.isDbEnabled()).toBe(true);
        expect(db.pgPool.options.ssl).toEqual({ rejectUnauthorized: false });
        await db.pgPool.end();
    });
});
