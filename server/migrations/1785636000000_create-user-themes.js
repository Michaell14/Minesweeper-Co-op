/**
 * user_themes — a player's saved custom palettes. The id is CLIENT-minted and
 * unique per player, so the key is (user_id, id) and saves upsert against it.
 * The blob is client-owned like user_settings; validation.js caps its shape.
 * ON DELETE CASCADE, so userRepo.deleteUser stays the single deletion point.
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
