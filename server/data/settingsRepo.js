/**
 * The per-account settings mirror. The blob is CLIENT-owned and sanitised on
 * that side (lib/settings.ts), so this repo stores and returns it whole;
 * validation.js caps size and shape at the door. Throws when Postgres is
 * missing or down; settingsController owns the policy.
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

/** Stores the blob whole. One upsert, so two tabs saving together both land, last write winning. */
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
