/**
 * The Postgres pool singleton, beside io and Redis at layer 1. Unlike Redis,
 * Postgres is OPTIONAL: it holds account data (USER_PROFILES_PRD.md) and the
 * game runs fully without it. No DATABASE_URL means no pool; game paths treat
 * writes as best-effort. Requiring this never opens a connection — `new Pool`
 * connects on first query.
 */
require('dotenv').config();
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || '';

/**
 * Heroku Postgres fronts TLS with a certificate the default CA bundle cannot
 * verify; local Postgres speaks no TLS. scripts/run-migrations.js applies the
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
    // An idle client losing its connection emits 'error' on the pool; unhandled,
    // that takes the server down. The pool replaces the client on its own.
    pgPool.on('error', (err) => {
        console.error('Postgres pool error:', err);
    });
} else {
    console.log('Postgres: DATABASE_URL is unset — running without a database (account features off).');
}

/** Whether a database is configured. Check this before feature-gated reads. */
const isDbEnabled = () => pgPool !== null;

/** One query. Throws when no database is configured: game paths catch, account endpoints surface it. */
async function query(text, params) {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    return pgPool.query(text, params);
}

module.exports = { pgPool, isDbEnabled, query };
