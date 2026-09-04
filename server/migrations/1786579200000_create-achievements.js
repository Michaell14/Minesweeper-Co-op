/**
 * The achievement shelf: one row per (user, achievement) earned. Written ONLY
 * inside statsRepo.recordResult's transaction, alongside the result that
 * earned it; no endpoint awards anything. `achievement_id` is TEXT holding a
 * catalog id from shared/achievements.js, not a foreign key: an id retired
 * from the catalog leaves the earned row alone. NEVER pruned, unlike
 * game_results. Purely additive (expand-migrate-contract); cascades from
 * users, so userRepo.deleteUser stays the single deletion point.
 */

exports.up = (pgm) => {
    pgm.createTable('user_achievements', {
        user_id: {
            type: 'uuid',
            notNull: true,
            references: 'users',
            onDelete: 'CASCADE',
        },
        achievement_id: { type: 'text', notNull: true },
        earned_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    });
    pgm.addConstraint('user_achievements', 'user_achievements_pkey', {
        primaryKey: ['user_id', 'achievement_id'],
    });
};

exports.down = (pgm) => {
    pgm.dropTable('user_achievements');
};
