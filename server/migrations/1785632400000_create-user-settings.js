/**
 * user_settings: one JSONB blob per account, the server mirror of the client's
 * localStorage settings. JSONB rather than columns because the CLIENT owns the
 * blob's schema (lib/settings.ts sanitises both directions) and the server only
 * stores and returns it whole; validation.js caps its size. ON DELETE CASCADE:
 * account deletion is a single DELETE on users (userRepo.deleteUser).
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
