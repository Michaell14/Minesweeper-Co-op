/**
 * The Postgres singleton's two modes, against the REAL module (mockInfra's mock
 * is undone below). Disabled mode must load, report the database absent, and
 * fail queries clearly: it is what runs without the addon. `new Pool` opens no
 * connection until first query, so enabled-mode tests only inspect config.
 */

jest.unmock('../utils/initializePgClient');

/**
 * Fresh copy of the module under a chosen DATABASE_URL. dotenv is stubbed so a
 * developer's server/.env cannot leak a real URL into the "unset" case.
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
