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
const { advanceStreak, streaksFromDays, utcDayOf } = require('../domain/streak');

/** How many recent games each player keeps, per the PRD (aggregates + window). */
const RECENT_WINDOW = 50;

/** Mode → user_stats column prefix. Modes come from our own call sites. */
const MODE_COLUMNS = { 'co-op': 'coop', pvp: 'pvp', daily: 'daily' };

/**
 * Records one finished game and everything downstream of it, atomically.
 *
 * @param userId  the account (callers have already resolved and null-checked)
 * @param result  { mode, boardKey, won, durationMs|null, players, finishedAt,
 *                  dailyDate? } — dailyDate is the daily's PUZZLE date
 *                  ('YYYY-MM-DD' UTC), the calendar key; see the migration.
 */
const recordResult = async (userId, { mode, boardKey, won, durationMs, players, finishedAt, dailyDate }) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    const prefix = MODE_COLUMNS[mode];
    if (!prefix) throw new Error(`Unknown mode for stats: ${mode}`);

    // Re-validated here even though the producer already regex-checks it: a
    // daily result without a usable date still records everything else and
    // just skips the daily-specific writes, so a drifted producer can never
    // block the base stats.
    const isDaily = mode === 'daily' && typeof dailyDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dailyDate);

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
            daily_current_streak: 0, daily_best_streak: 0,
            last_daily_day: null,
        };
        const streak = advanceStreak(
            {
                currentStreak: row.current_streak,
                bestStreak: row.best_streak,
                lastPlayedDay: row.last_played_day,
            },
            utcDayOf(finishedAt),
        );
        // The calendar row: one per (user, puzzle day), never pruned. A loss
        // only lands on an empty day; a win upgrades a loss or a slower win.
        // Written BEFORE the stats row because the streak below is derived
        // from this table. Safe concurrency-wise: the FOR UPDATE above already
        // serialises same-user transactions, so the ON CONFLICT cannot
        // deadlock.
        if (isDaily) {
            await client.query(
                `INSERT INTO user_daily_results (user_id, day, won, duration_ms, finished_at)
                 VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
                 ON CONFLICT (user_id, day) DO UPDATE SET
                     won = true,
                     duration_ms = EXCLUDED.duration_ms,
                     finished_at = EXCLUDED.finished_at
                 WHERE EXCLUDED.won
                   AND (NOT user_daily_results.won
                        OR EXCLUDED.duration_ms < user_daily_results.duration_ms)`,
                [userId, dailyDate, won, durationMs, finishedAt],
            );
        }

        // The daily-clear streak: WINS only (losing the daily breaks nothing —
        // it just doesn't extend), and recomputed from the calendar rather
        // than accumulated. Accumulating assumes wins arrive in day order,
        // and they don't have to: a leftover attempt (48h TTL) can win after
        // a later day already recorded, and an accumulator can refuse to go
        // backwards but never repair the gap. Deriving from the table makes
        // arrival order unable to matter.
        let dailyStreak = {
            currentStreak: row.daily_current_streak,
            bestStreak: row.daily_best_streak,
            lastPlayedDay: row.last_daily_day,
        };
        if (isDaily && won) {
            const wonDays = await client.query(
                'SELECT day FROM user_daily_results WHERE user_id = $1 AND won ORDER BY day DESC',
                [userId],
            );
            dailyStreak = streaksFromDays(wonDays.rows.map((r) => r.day));
        }
        const games = row[`${prefix}_games`] + 1;
        const wins = row[`${prefix}_wins`] + (won ? 1 : 0);

        await client.query(
            `INSERT INTO user_stats (user_id, ${prefix}_games, ${prefix}_wins,
                 current_streak, best_streak, last_played_day,
                 daily_current_streak, daily_best_streak, last_daily_day, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
             ON CONFLICT (user_id) DO UPDATE SET
                 ${prefix}_games = $2,
                 ${prefix}_wins = $3,
                 current_streak = $4,
                 best_streak = $5,
                 last_played_day = $6,
                 daily_current_streak = $7,
                 daily_best_streak = $8,
                 last_daily_day = $9,
                 updated_at = now()`,
            [userId, games, wins, streak.currentStreak, streak.bestStreak, streak.lastPlayedDay,
                dailyStreak.currentStreak, dailyStreak.bestStreak, dailyStreak.lastPlayedDay],
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

    const [stats, bests, recent, daily] = await Promise.all([
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
        // Unbounded on purpose: unlike game_results this table is never
        // pruned, and a whole year is 365 tiny rows.
        pgPool.query(
            'SELECT day, won, duration_ms FROM user_daily_results WHERE user_id = $1 ORDER BY day ASC',
            [userId],
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
            dailyCurrentStreak: row?.daily_current_streak ?? 0,
            dailyBestStreak: row?.daily_best_streak ?? 0,
            lastDailyDay: row?.last_daily_day ?? null,
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
        dailyHistory: daily.rows.map((d) => ({
            day: d.day,
            won: d.won,
            durationMs: d.duration_ms,
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
