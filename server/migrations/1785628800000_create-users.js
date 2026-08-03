/**
 * users — one row per account.
 *
 * Identity is the OAuth pair (provider, provider_account_id): sign-in does a
 * get-or-create on it, so it carries the unique constraint. Email is informative
 * only — two providers can report the same address, so it is deliberately NOT
 * unique. display_name is what other players see in rooms and on the daily
 * leaderboard; profiles are private, so it has no uniqueness requirement either.
 */

exports.up = (pgm) => {
    pgm.createTable('users', {
        id: {
            type: 'uuid',
            primaryKey: true,
            default: pgm.func('gen_random_uuid()'),
        },
        provider: { type: 'text', notNull: true },
        provider_account_id: { type: 'text', notNull: true },
        email: { type: 'text' },
        display_name: { type: 'text', notNull: true },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    });

    pgm.addConstraint('users', 'users_provider_identity_unique', {
        unique: ['provider', 'provider_account_id'],
    });
};

exports.down = (pgm) => {
    pgm.dropTable('users');
};
