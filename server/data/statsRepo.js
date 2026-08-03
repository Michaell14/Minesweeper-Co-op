/**
 * Game results and their aggregates — the one repo that uses a real
 * transaction. A result is four writes (the result row, the prune, the
 * aggregates, maybe a board best) that must land together or not at all: an
 * aggregate counted without its result row, or vice versa, is a lie the
 * profile page would then faithfully report.
 *
 * Concurrency: the user_stats row is taken FOR UPDATE inside the transaction,
 * so two results for the same player (a co-op win landing while their daily
 * loss records) serialise instead of losing an increment. Different players
 * never wait on each other.
 *
 * Same failure contract as the other Postgres repos: throws when the database
 * is missing or down. The CALLER decides policy — and for game paths that is
 * always best-effort (utils/statsRecorder catches and drops).
 */

const { pgPool } = require('../utils/initializePgClient');
const { advanceStreak, utcDayOf } = require('../domain/streak');

/** How many recent games each player keeps, per the PRD (aggregates + window). */
const RECENT_WINDOW = 50;

/** Mode → user_stats column prefix. Modes come from our own call sites. */
const MODE_COLUMNS = { 'co-op': 'coop', pvp: 'pvp', daily: 'daily' };

/**
 * Records one finished game and everything downstream of it, atomically.
 *
 * @param userId  the account (callers have already resolved and null-checked)
 * @param result  { mode, boardKey, won, durationMs|null, players, finishedAt }
 */
const recordResult = async (userId, { mode, boardKey, won, durationMs, players, finishedAt }) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    const prefix = MODE_COLUMNS[mode];
    if (!prefix) throw new Error(`Unknown mode for stats: ${mode}`);

    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO game_results (user_id, mode, board_key, won, duration_ms, players, finished_at)
             VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))`,
            [userId, mode, boardKey, won, durationMs, players, finishedAt],
        );

        // The recent window: everything older than the newest N goes.
        await client.query(
            `DELETE FROM game_results
             WHERE user_id = $1 AND id NOT IN (
                 SELECT id FROM game_results
                 WHERE user_id = $1
                 ORDER BY finished_at DESC, id DESC
                 LIMIT $2
             )`,
            [userId, RECENT_WINDOW],
        );

        // Seed the row first: FOR UPDATE on an ABSENT row locks nothing, so a
        // player's first-ever two results landing simultaneously could both
        // compute from zeros and lose an increment. With the row guaranteed,
        // the lock below serialises them like every later pair.
        await client.query(
            'INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
            [userId],
        );

        // Aggregates: read the row under lock, compute in JS (the streak is
        // domain logic, not SQL), write back whole.
        const existing = await client.query(
            'SELECT * FROM user_stats WHERE user_id = $1 FOR UPDATE',
            [userId],
        );
        // The seed insert above guarantees a row; the fallback only protects
        // against a fake client in tests that answers the SELECT with nothing.
        const row = existing.rows[0] ?? {
            coop_games: 0, coop_wins: 0,
            pvp_games: 0, pvp_wins: 0,
            daily_games: 0, daily_wins: 0,
            current_streak: 0, best_streak: 0,
            last_played_day: null,
        };
        const streak = advanceStreak(
            {
                currentStreak: row.current_streak,
                bestStreak: row.best_streak,
                lastPlayedDay: row.last_played_day,
            },
            utcDayOf(finishedAt),
        );
        const games = row[`${prefix}_games`] + 1;
        const wins = row[`${prefix}_wins`] + (won ? 1 : 0);

        await client.query(
            `INSERT INTO user_stats (user_id, ${prefix}_games, ${prefix}_wins,
                 current_streak, best_streak, last_played_day, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (user_id) DO UPDATE SET
                 ${prefix}_games = $2,
                 ${prefix}_wins = $3,
                 current_streak = $4,
                 best_streak = $5,
                 last_played_day = $6,
                 updated_at = now()`,
            [userId, games, wins, streak.currentStreak, streak.bestStreak, streak.lastPlayedDay],
        );

        // A board best is a WIN with a measured time; keep only if faster.
        if (won && typeof durationMs === 'number' && durationMs >= 0) {
            await upsertBest(client, userId, {
                boardKey,
                seconds: Math.floor(durationMs / 1000),
                players,
                achievedAt: finishedAt,
            });
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

/** Keep-if-faster upsert. `client` may be a pool or a transaction client. */
const upsertBest = (client, userId, { boardKey, seconds, players, achievedAt }) =>
    client.query(
        `INSERT INTO user_board_bests (user_id, board_key, seconds, players, achieved_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
         ON CONFLICT (user_id, board_key) DO UPDATE SET
             seconds = EXCLUDED.seconds,
             players = EXCLUDED.players,
             achieved_at = EXCLUDED.achieved_at
         WHERE EXCLUDED.seconds < user_board_bests.seconds`,
        [userId, boardKey, seconds, players, achievedAt],
    );

/** Everything the profile page shows, in one read. */
const getProfile = async (userId) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const [stats, bests, recent] = await Promise.all([
        pgPool.query('SELECT * FROM user_stats WHERE user_id = $1', [userId]),
        pgPool.query(
            'SELECT board_key, seconds, players, achieved_at FROM user_board_bests WHERE user_id = $1 ORDER BY achieved_at DESC',
            [userId],
        ),
        pgPool.query(
            `SELECT mode, board_key, won, duration_ms, players, finished_at
             FROM game_results WHERE user_id = $1
             ORDER BY finished_at DESC, id DESC LIMIT $2`,
            [userId, RECENT_WINDOW],
        ),
    ]);

    const row = stats.rows[0];
    return {
        stats: {
            coopGames: row?.coop_games ?? 0,
            coopWins: row?.coop_wins ?? 0,
            pvpGames: row?.pvp_games ?? 0,
            pvpWins: row?.pvp_wins ?? 0,
            dailyGames: row?.daily_games ?? 0,
            dailyWins: row?.daily_wins ?? 0,
            currentStreak: row?.current_streak ?? 0,
            bestStreak: row?.best_streak ?? 0,
            lastPlayedDay: row?.last_played_day ?? null,
        },
        boardBests: bests.rows.map((b) => ({
            boardKey: b.board_key,
            seconds: b.seconds,
            players: b.players,
            achievedAt: b.achieved_at,
        })),
        recentGames: recent.rows.map((g) => ({
            mode: g.mode,
            boardKey: g.board_key,
            won: g.won,
            durationMs: g.duration_ms,
            players: g.players,
            finishedAt: g.finished_at,
        })),
    };
};

/**
 * The one-time guest import: this browser's localStorage bests folded in,
 * keep-if-faster — so importing can only improve a profile, never damage it,
 * and re-importing is harmless. Client-reported numbers, accepted knowingly
 * (recorded in the PRD): they seed a private profile, not a leaderboard.
 */
const importBests = async (userId, bests) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        for (const best of bests) {
            await upsertBest(client, userId, best);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = { recordResult, getProfile, importBests, RECENT_WINDOW };
