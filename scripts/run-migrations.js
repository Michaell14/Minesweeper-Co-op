/**
 * Runs the server's database migrations, from the Heroku release phase (see
 * Procfile) or by hand. Release phase rather than heroku-postbuild: it runs
 * after the build succeeds and before new dynos boot, with full config vars,
 * and a failure here aborts the release instead of shipping a server whose
 * schema is behind its code.
 *
 * Without DATABASE_URL it exits 0: production before Postgres is provisioned,
 * and every contributor without a local database, must deploy and run cleanly.
 *
 * Migrations must stay compatible one release back (expand → migrate →
 * contract): the previous dynos keep serving until the release phase finishes,
 * so a column can only be dropped one release after the code stopped using it.
 */
const { execSync } = require('child_process');

const url = process.env.DATABASE_URL;

if (!url) {
    console.log('No DATABASE_URL — skipping migrations (account features are off).');
    process.exit(0);
}

// Heroku Postgres needs TLS without CA verification; local Postgres needs no
// TLS. Same heuristic as server/utils/initializePgClient.js — keep in step.
// `sslmode=no-verify` is how node-postgres spells rejectUnauthorized:false in
// a connection string, which is the only knob node-pg-migrate exposes.
const isLocal = /localhost|127\.0\.0\.1/.test(url);
const migrateUrl = isLocal || url.includes('sslmode=')
    ? url
    : `${url}${url.includes('?') ? '&' : '?'}sslmode=no-verify`;

try {
    execSync('npm --prefix server run migrate', {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: migrateUrl },
    });
} catch {
    // The child already printed the real error to stderr via stdio: 'inherit'.
    process.exit(1);
}
