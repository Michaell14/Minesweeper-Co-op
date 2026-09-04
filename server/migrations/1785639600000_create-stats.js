/**
 * The stats tables (USER_PROFILES_PRD.md Phase 6), written ONLY by the game
 * server when it decides a game ended. user_stats holds lifetime aggregates
 * and the day-streak (last_played_day is TEXT 'YYYY-MM-DD' UTC, since pg
 * parses `date` into local JS Dates); game_results is the recent window,
 * pruned to ~50 (statsRepo); user_board_bests is the fastest clear per board,
 * keyed by dimensions and mines (never labels, CLAUDE.md trap #10). All three
 * cascade from users, so userRepo.deleteUser stays the single deletion point.
 */

exports.up = (pgm) => {
    pgm.createTable('user_stats', {
        user_id: {
            type: 'uuid',
            primaryKey: true,
            references: 'users',
            onDelete: 'CASCADE',
        },
        coop_games: { type: 'integer', notNull: true, default: 0 },
        coop_wins: { type: 'integer', notNull: true, default: 0 },
        pvp_games: { type: 'integer', notNull: true, default: 0 },
        pvp_wins: { type: 'integer', notNull: true, default: 0 },
        daily_games: { type: 'integer', notNull: true, default: 0 },
        daily_wins: { type: 'integer', notNull: true, default: 0 },
        current_streak: { type: 'integer', notNull: true, default: 0 },
        best_streak: { type: 'integer', notNull: true, default: 0 },
        last_played_day: { type: 'text' },
        updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    });

    pgm.createTable('game_results', {
        id: 'id', // serial primary key
        user_id: {
            type: 'uuid',
            notNull: true,
            references: 'users',
            onDelete: 'CASCADE',
        },
        mode: { type: 'text', notNull: true },
        board_key: { type: 'text', notNull: true },
        won: { type: 'boolean', notNull: true },
        duration_ms: { type: 'integer' },
        players: { type: 'integer', notNull: true },
        finished_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    });
    pgm.createIndex('game_results', ['user_id', { name: 'finished_at', sort: 'DESC' }]);

    pgm.createTable('user_board_bests', {
        user_id: {
            type: 'uuid',
            notNull: true,
            references: 'users',
            onDelete: 'CASCADE',
        },
        board_key: { type: 'text', notNull: true },
        seconds: { type: 'integer', notNull: true },
        players: { type: 'integer', notNull: true },
        achieved_at: { type: 'timestamptz', notNull: true },
    });
    pgm.addConstraint('user_board_bests', 'user_board_bests_pkey', {
        primaryKey: ['user_id', 'board_key'],
    });
};

exports.down = (pgm) => {
    pgm.dropTable('user_board_bests');
    pgm.dropTable('game_results');
    pgm.dropTable('user_stats');
};
