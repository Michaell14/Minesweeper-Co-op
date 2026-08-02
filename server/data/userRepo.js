/**
 * Accounts — the first Postgres-backed repo.
 *
 * Everything else under data/ is Redis with a TTL; users must outlive one, so
 * they live in the `users` table (see server/migrations/). Same access rule as
 * the Redis repos: nothing outside server/data writes SQL against this table.
 *
 * Callers own the failure policy. These throw when Postgres is missing or
 * down; account endpoints surface that as an error, while game paths catch and
 * carry on — a database outage may take down sign-in, never a move.
 */

const { query } = require('../utils/initializePgClient');

/** camelCase view of a row. Everything the client may see; no secrets here. */
const rowToUser = (row) => ({
    id: row.id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
});

/**
 * The user for an OAuth identity, created on first sight.
 *
 * One statement, not SELECT-then-INSERT: two near-simultaneous connections
 * from the same new account (two tabs signing in together) would both miss the
 * SELECT and one INSERT would throw. ON CONFLICT makes the race harmless.
 *
 * Email refreshes on every call — the provider owns it and it can change
 * there. display_name deliberately does NOT: the OAuth profile name is only
 * the starting value, and overwriting it on each sign-in would silently revert
 * every rename made in the account menu.
 */
const getOrCreateUser = async ({ provider, providerAccountId, email, displayName }) => {
    const result = await query(
        `INSERT INTO users (provider, provider_account_id, email, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (provider, provider_account_id)
         DO UPDATE SET email = EXCLUDED.email
         RETURNING *`,
        [provider, providerAccountId, email, displayName],
    );
    return rowToUser(result.rows[0]);
};

/** The user with this id, or null. */
const getUserById = async (id) => {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
};

/**
 * Renames a user. Returns the updated user, or null if the id matched nothing
 * — which the caller treats as the account having been deleted under them.
 */
const updateDisplayName = async (id, displayName) => {
    const result = await query(
        'UPDATE users SET display_name = $2 WHERE id = $1 RETURNING *',
        [id, displayName],
    );
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
};

/**
 * Hard delete — the account row is gone, not flagged. Tables added by later
 * phases (settings, themes, results) must declare ON DELETE CASCADE against
 * users so this stays the single deletion point. Returns whether a row went.
 */
const deleteUser = async (id) => {
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    return result.rowCount > 0;
};

module.exports = { getOrCreateUser, getUserById, updateDisplayName, deleteUser };
