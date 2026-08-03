/**
 * user_themes — a player's saved custom palettes.
 *
 * The theme id is CLIENT-minted (a slug), unique per player rather than
 * globally, so the key is (user_id, id) and saves are upserts against it.
 * The blob (name, nine core colours, resolved palette) is client-owned like
 * user_settings; the server caps its shape and size in validation.js and
 * stores it whole.
 *
 * ON DELETE CASCADE, same as user_settings: userRepo.deleteUser stays the
 * single deletion point.
 */

exports.up = (pgm) => {
    pgm.createTable('user_themes', {
        user_id: {
            type: 'uuid',
            notNull: true,
            references: 'users',
            onDelete: 'CASCADE',
        },
        id: { type: 'text', notNull: true },
        theme: { type: 'jsonb', notNull: true },
        updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    });
    pgm.addConstraint('user_themes', 'user_themes_pkey', {
        primaryKey: ['user_id', 'id'],
    });
};

exports.down = (pgm) => {
    pgm.dropTable('user_themes');
};
