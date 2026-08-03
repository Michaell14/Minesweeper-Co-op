/**
 * The per-account settings mirror. The blob is CLIENT-owned — sanitised on
 * that side both reading and writing (lib/settings.ts) — so this repo stores
 * and returns it whole and never looks inside; validation.js caps its size and
 * shape at the door, and that is the server's entire opinion of it.
 *
 * Same failure contract as userRepo: throws when Postgres is missing or down,
 * and the caller (settingsController) owns the policy.
 */

const { query } = require('../utils/initializePgClient');

/** The stored blob, or null if this account has never synced. */
const getSettings = async (userId) => {
    const result = await query(
        'SELECT settings FROM user_settings WHERE user_id = $1',
        [userId],
    );
    return result.rows[0] ? result.rows[0].settings : null;
};

/**
 * Stores the blob, whole. One upserting statement for the same reason as
 * userRepo: two tabs saving together must both land, last write winning.
 */
const saveSettings = async (userId, settings) => {
    await query(
        `INSERT INTO user_settings (user_id, settings, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id)
         DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`,
        [userId, JSON.stringify(settings)],
    );
};

module.exports = { getSettings, saveSettings };
