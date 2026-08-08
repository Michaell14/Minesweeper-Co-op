/**
 * Per-day daily-challenge history, backing the /profile calendar.
 *
 * - user_daily_results: one row per (user, puzzle day), written in the same
 *   transaction as the rest of a result (statsRepo.recordResult). `day` is
 *   TEXT ('YYYY-MM-DD', UTC puzzle date) for the same reason as
 *   user_stats.last_played_day: pg parses `date` columns into local-midnight
 *   JS Dates, the exact timezone trap the streak logic avoids. Keyed on the
 *   PUZZLE date, not finished_at — an attempt can legally finish after UTC
 *   midnight (48h Redis TTL) and still belongs to the day it was set.
 *   NEVER pruned, unlike game_results: a year is 365 tiny rows, and the
 *   calendar is only useful if history survives.
 * - user_stats gains the daily-clear streak (consecutive UTC days with the
 *   daily WON — a clear streak, unlike current_streak's any-mode play
 *   streak).
 *
 * Purely additive with defaults, so the previous release runs unmodified
 * against the new schema (expand-migrate-contract). Cascades from users:
 * userRepo.deleteUser stays the single deletion point.
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
