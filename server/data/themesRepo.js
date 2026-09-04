/**
 * Saved custom palettes, keyed (user_id, theme id). Client-owned blobs like
 * settingsRepo, stored whole; validation.js caps shape and size. Throws when
 * Postgres is missing or down; the controller owns the policy.
 */

const { query } = require('../utils/initializePgClient');

/** Everything on this account's shelf, oldest first. */
const listThemes = async (userId) => {
    const result = await query(
        'SELECT theme FROM user_themes WHERE user_id = $1 ORDER BY updated_at ASC',
        [userId],
    );
    return result.rows.map((row) => row.theme);
};

/** Upsert on (user_id, id) — the same save from two tabs lands last-write-wins. */
const saveTheme = async (userId, id, theme) => {
    await query(
        `INSERT INTO user_themes (user_id, id, theme, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, id)
         DO UPDATE SET theme = EXCLUDED.theme, updated_at = now()`,
        [userId, id, JSON.stringify(theme)],
    );
};

/** Idempotent delete; returns whether a row went. */
const deleteTheme = async (userId, id) => {
    const result = await query(
        'DELETE FROM user_themes WHERE user_id = $1 AND id = $2',
        [userId, id],
    );
    return result.rowCount > 0;
};

/** How many themes this account holds — the cap check reads, then saves. */
const countThemes = async (userId) => {
    const result = await query(
        'SELECT count(*)::int AS count FROM user_themes WHERE user_id = $1',
        [userId],
    );
    return result.rows[0].count;
};

/** Whether this id already exists — an UPDATE at the cap is still allowed. */
const hasTheme = async (userId, id) => {
    const result = await query(
        'SELECT 1 FROM user_themes WHERE user_id = $1 AND id = $2',
        [userId, id],
    );
    return result.rows.length > 0;
};

module.exports = { listThemes, saveTheme, deleteTheme, countThemes, hasTheme };
