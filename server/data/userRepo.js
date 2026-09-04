/**
 * Accounts, in the Postgres `users` table (server/migrations/) since they must
 * outlive a Redis TTL. Nothing outside server/data writes SQL against it.
 * Throws when Postgres is down; callers own the failure policy, so an outage
 * may take down sign-in but never a move.
 */

const { query } = require('../utils/initializePgClient');
const { generateFriendCode } = require('../domain/friendCode');

/** camelCase view of a row; nothing secret. */
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
 * The user for an OAuth identity, created on first sight. One statement so two
 * tabs signing in together cannot race. Email refreshes every call (the
 * provider owns it); display_name does not, or each sign-in would revert a rename.
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
 * Updates only the fields provided (COALESCE). Returns null if the id matched
 * nothing, which the caller treats as the account being deleted under them.
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
 * Hard delete. Every table referencing users must declare ON DELETE CASCADE so
 * this stays the single deletion point. Returns whether a row went.
 */
const deleteUser = async (id) => {
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    return result.rowCount > 0;
};

/** Postgres's unique-violation code. */
const UNIQUE_VIOLATION = '23505';

/**
 * This account's friend code, minted lazily on first ask. The claim is
 * `WHERE friend_code IS NULL`, so two tabs cannot overwrite each other: the
 * loser matches no row and re-reads. A unique-index collision is a retry, not
 * a 500 for a dice roll.
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

/** The account a typed code belongs to, or null. Codes are stored normalised. */
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
