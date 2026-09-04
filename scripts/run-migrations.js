/**
 * Runs the server's database migrations, from the Heroku release phase (see
 * Procfile) or by hand. Release phase, not heroku-postbuild: it runs with
 * full config vars and a failure aborts the release. Without DATABASE_URL it
 * exits 0 so contributors without Postgres deploy and run cleanly. Migrations
 * must stay compatible one release back (expand, migrate, contract): the
 * previous dynos keep serving until the release phase finishes.
 */
const { execSync } = require('child_process');

const url = process.env.DATABASE_URL;

if (!url) {
    console.log('No DATABASE_URL — skipping migrations (account features are off).');
    process.exit(0);
}

// Heroku Postgres needs TLS without CA verification; local needs none. Same
// heuristic as server/utils/initializePgClient.js, kept in step. `sslmode=no-verify`
// is how node-postgres spells rejectUnauthorized:false in a connection string.
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
