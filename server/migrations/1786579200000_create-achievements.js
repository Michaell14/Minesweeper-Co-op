/**
 * The achievement shelf: one row per (user, achievement) the player has earned.
 *
 * Written ONLY inside statsRepo.recordResult's transaction, alongside the
 * result that earned it — an achievement without its result row is the same
 * kind of lie an aggregate without one would be. There is no endpoint that
 * awards anything, which is the same server-authoritative promise the rest of
 * stats makes.
 *
 * `achievement_id` is TEXT holding a catalog id from shared/achievements.js,
 * not a foreign key: the catalog is code, ships with the deploy, and an id
 * retired from it should leave the earned row alone rather than delete it.
 *
 * NEVER pruned, unlike game_results — a lifetime shelf is ~30 tiny rows and is
 * only meaningful if it survives.
 *
 * Purely additive, so the previous release runs unmodified against the new
 * schema (expand-migrate-contract). Cascades from users: userRepo.deleteUser
 * stays the single deletion point.
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
