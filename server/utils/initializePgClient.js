/**
 * The Postgres pool singleton, beside the io and Redis singletons at layer 1.
 *
 * Unlike Redis, Postgres is OPTIONAL. Redis holds the live game and the server
 * cannot run without it; Postgres holds durable account data (users, settings,
 * stats — see USER_PROFILES_PRD.md) and the game must run fully without it.
 * No DATABASE_URL means no pool: sign-in and profiles are off, everything else
 * is untouched. Callers on game paths treat writes as best-effort — log and
 * drop, never block a move on the database.
 *
 * Requiring this module never opens a connection: `new Pool` is lazy and
 * connects on first query, so a contributor without Postgres pays nothing.
 */
require('dotenv').config();
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || '';

/**
 * Heroku Postgres requires TLS but fronts it with a certificate the default CA
 * bundle cannot verify, so remote connections need `rejectUnauthorized: false`;
 * local Postgres speaks no TLS at all. scripts/run-migrations.js applies the
 * same heuristic — keep them in step.
 */
const isLocal = /localhost|127\.0\.0\.1/.test(databaseUrl);

const pgPool = databaseUrl
    ? new Pool({
          connectionString: databaseUrl,
          ssl: isLocal ? false : { rejectUnauthorized: false },
      })
    : null;

if (pgPool) {
    // An idle client losing its connection emits 'error' on the pool; without
    // a listener that is an uncaught exception that takes the whole server
    // down. Log it — the pool replaces the client on its own.
    pgPool.on('error', (err) => {
        console.error('Postgres pool error:', err);
    });
} else {
    console.log('Postgres: DATABASE_URL is unset — running without a database (account features off).');
}

/** Whether a database is configured. Check this before feature-gated reads. */
const isDbEnabled = () => pgPool !== null;

/**
 * One query against the pool. Throws when no database is configured — game
 * paths catch and continue, account endpoints surface the failure.
 */
async function query(text, params) {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    return pgPool.query(text, params);
}

module.exports = { pgPool, isDbEnabled, query };
