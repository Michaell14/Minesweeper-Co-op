/**
 * Per-day daily-challenge history, backing the /profile calendar.
 *
 * user_daily_results: one row per (user, puzzle day), written in the same
 * transaction as the rest of a result. `day` is TEXT (UTC puzzle date), like
 * user_stats.last_played_day, since pg parses `date` into local-midnight JS
 * Dates; keyed on the PUZZLE date, not finished_at, since an attempt can finish
 * after UTC midnight. Never pruned. user_stats gains the daily-clear streak.
 *
 * Additive with defaults, so the previous release runs against it. Cascades
 * from users, so userRepo.deleteUser stays the single deletion point.
 */

exports.up = (pgm) => {
    pgm.createTable('user_daily_results', {
        user_id: {
            type: 'uuid',
            notNull: true,
            references: 'users',
            onDelete: 'CASCADE',
        },
        day: { type: 'text', notNull: true },
        won: { type: 'boolean', notNull: true },
        duration_ms: { type: 'integer' },
        finished_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    });
    pgm.addConstraint('user_daily_results', 'user_daily_results_pkey', {
        primaryKey: ['user_id', 'day'],
    });

    pgm.addColumns('user_stats', {
        daily_current_streak: { type: 'integer', notNull: true, default: 0 },
        daily_best_streak: { type: 'integer', notNull: true, default: 0 },
        last_daily_day: { type: 'text' },
    });
};

exports.down = (pgm) => {
    pgm.dropColumns('user_stats', ['daily_current_streak', 'daily_best_streak', 'last_daily_day']);
    pgm.dropTable('user_daily_results');
};
