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
const { generateFriendCode } = require('../domain/friendCode');

/** camelCase view of a row. Everything the client may see; no secrets here. */
const rowToUser = (row) => ({
    id: row.id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    email: row.email,
    displayName: row.display_name,
    avatar: row.avatar,
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
 * Updates the profile fields a player may edit — only those provided; a field
 * left undefined keeps its stored value (COALESCE, one statement either way).
 * Returns the updated user, or null if the id matched nothing — which the
 * caller treats as the account having been deleted under them.
 */
const updateUser = async (id, { displayName, avatar }) => {
    const result = await query(
        `UPDATE users SET
            display_name = COALESCE($2, display_name),
            avatar = COALESCE($3, avatar)
         WHERE id = $1 RETURNING *`,
        [id, displayName ?? null, avatar ?? null],
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

/** Postgres's unique-violation code. */
const UNIQUE_VIOLATION = '23505';

/**
 * This account's friend code, minting one the first time anybody asks.
 *
 * Lazy rather than backfilled: most accounts will never use friends, and a
 * column filled on first read has exactly one place where a code comes into
 * existence.
 *
 * The claim is `WHERE friend_code IS NULL`, so two tabs asking at once cannot
 * overwrite each other — the loser matches no row and re-reads the winner's
 * code. A collision with somebody else's code fails the unique index, which is
 * a retry rather than an error: at 40 bits it is not going to happen, and the
 * alternative is handing back a 500 for a dice roll.
 */
const getOrCreateFriendCode = async (userId) => {
    for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await query('SELECT friend_code FROM users WHERE id = $1', [userId]);
        if (existing.rows.length === 0) return null;          // account gone
        if (existing.rows[0].friend_code) return existing.rows[0].friend_code;

        try {
            const claimed = await query(
                `UPDATE users SET friend_code = $2
                 WHERE id = $1 AND friend_code IS NULL
                 RETURNING friend_code`,
                [userId, generateFriendCode()],
            );
            if (claimed.rows.length > 0) return claimed.rows[0].friend_code;
            // Lost the race: the next loop reads what the winner wrote.
        } catch (error) {
            if (error.code !== UNIQUE_VIOLATION) throw error;
        }
    }
    throw new Error('Could not allocate a friend code');
};

/** The account a typed code belongs to, or null. Codes are stored NORMALISED. */
const findByFriendCode = async (code) => {
    const result = await query('SELECT * FROM users WHERE friend_code = $1', [code]);
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
};

module.exports = {
    getOrCreateUser,
    getUserById,
    updateUser,
    deleteUser,
    getOrCreateFriendCode,
    findByFriendCode,
};
