/**
 * user_settings — one JSONB blob per account, the server mirror of the
 * client's localStorage settings (see USER_PROFILES_PRD.md Phase 2).
 *
 * JSONB rather than columns on purpose: the schema of the blob is owned by
 * the CLIENT (lib/settings.ts sanitises both directions), settings churn with
 * every PRD phase, and the server only ever stores and returns it whole. A
 * size cap in validation.js is the server's entire opinion about the shape.
 *
 * ON DELETE CASCADE: account deletion is a single DELETE on users
 * (userRepo.deleteUser), and every later table must ride it the same way.
 */

exports.up = (pgm) => {
    pgm.createTable('user_settings', {
        user_id: {
            type: 'uuid',
            primaryKey: true,
            references: 'users',
            onDelete: 'CASCADE',
        },
        settings: { type: 'jsonb', notNull: true },
        updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    });
};

exports.down = (pgm) => {
    pgm.dropTable('user_settings');
};
