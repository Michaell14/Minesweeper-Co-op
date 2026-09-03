/**
 * Game results and their aggregates — the one repo that uses a real
 * transaction: the result row, the prune, the aggregates and a possible board
 * best land together or not at all. The user_stats row is taken FOR UPDATE, so
 * two results for one player serialise instead of losing an increment. Throws
 * when Postgres is missing or down; the caller decides policy (game paths are
 * best-effort via utils/statsRecorder).
 */

const { pgPool } = require('../utils/initializePgClient');
const { advanceStreak, streaksFromDays, utcDayOf } = require('../domain/streak');
const { earnedFrom } = require('../domain/achievements');
const { boardPartOf, playersFromKey, withPlayers } = require('../../shared/boardKeys');

/** Recent games kept per player, per the PRD. */
const RECENT_WINDOW = 50;

/** Mode → user_stats column prefix. Modes come from our own call sites. */
const MODE_COLUMNS = { 'co-op': 'coop', pvp: 'pvp', daily: 'daily' };

/**
 * A user_stats row in the shape the profile payload and the achievement
 * evaluator speak. One mapping, so awarded thresholds and shown progress agree.
 */
const snapshotOf = (row) => ({
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
});

/**
 * Records one finished game and everything downstream of it, atomically.
 *
 * @param userId  the account (already resolved and null-checked)
 * @param result  { mode, boardKey, won, durationMs|null, players, finishedAt,
 *                  dailyDate? } — dailyDate is the PUZZLE date ('YYYY-MM-DD' UTC)
 * @returns the achievement ids newly earned by this result
 */
const recordResult = async (userId, { mode, boardKey, won, durationMs, players, finishedAt, dailyDate }) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    const prefix = MODE_COLUMNS[mode];
    if (!prefix) throw new Error(`Unknown mode for stats: ${mode}`);

    // Re-validated so a drifted producer only skips the daily-specific
    // writes, never the base stats.
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
        // player's first two results could both compute from zeros.
        await client.query(
            'INSERT INTO user_stats (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
            [userId],
        );

        // Aggregates: read under lock, compute in JS, write back whole.
        const existing = await client.query(
            'SELECT * FROM user_stats WHERE user_id = $1 FOR UPDATE',
            [userId],
        );
        // The seed insert guarantees a row; the fallback only covers a fake test client.
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
        // Written before the stats row because the streak is derived from it.
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

        // The daily-clear streak counts WINS only, recomputed from the calendar
        // rather than accumulated: a leftover attempt (48h TTL) can win after a
        // later day already recorded, and an accumulator cannot repair the gap.
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

        // Achievements: the evaluator returns everything currently satisfied,
        // ON CONFLICT decides what is new and RETURNING hands back that, so
        // re-running a result awards nothing twice. In the transaction so an
        // achievement never outlives the result that earned it.
        const earned = earnedFrom(
            {
                ...snapshotOf(row),
                [`${prefix}Games`]: games,
                [`${prefix}Wins`]: wins,
                bestStreak: streak.bestStreak,
                dailyBestStreak: dailyStreak.bestStreak,
            },
            { mode, boardKey, won, durationMs, players },
        );
        const unlocked = await awardAchievements(client, userId, earned);

        /*
         * A board best is a WIN on a REPLAYABLE board with a measured time,
         * keep-if-faster. The daily is excluded: a different board every day
         * would become the record for a board nobody can replay (it keeps its
         * own history in user_daily_results). `players` is the CLEAR count,
         * read back out of the key rather than derived twice — the key is the
         * identity, the column mirrors it (CLAUDE.md trap 10).
         */
        if (mode !== 'daily' && won && typeof durationMs === 'number' && durationMs >= 0) {
            await upsertBest(client, userId, {
                boardKey,
                seconds: Math.floor(durationMs / 1000),
                players: playersFromKey(boardKey),
                achievedAt: finishedAt,
            });
        }

        await client.query('COMMIT');
        return unlocked;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Awards a set of achievement ids, returning only the ones that were new.
 * ON CONFLICT + RETURNING: no read first, re-awarding is a no-op, and two
 * concurrent results cannot both claim the same badge. `client` may be a pool
 * or a transaction client.
 */
const awardAchievements = async (client, userId, ids) => {
    if (ids.length === 0) return [];
    const inserted = await client.query(
        `INSERT INTO user_achievements (user_id, achievement_id)
         SELECT $1, unnest($2::text[])
         ON CONFLICT DO NOTHING
         RETURNING achievement_id`,
        [userId, ids],
    );
    return (inserted.rows || []).map((row) => row.achievement_id);
};

/**
 * One-shot: award every counter each existing player already qualifies for,
 * so the shelf is not blank on the day it ships. Idempotent. Moments cannot
 * fire here (no result, and every moment predicate requires a win); there is
 * nothing to reconstruct them from. Shaped for a one-off only: reads every
 * user_stats row into memory and makes one round-trip per player.
 */
const backfillAchievements = async () => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const players = await pgPool.query('SELECT * FROM user_stats');
    let awarded = 0;
    for (const row of players.rows) {
        const earned = earnedFrom(snapshotOf(row), {});
        awarded += (await awardAchievements(pgPool, row.user_id, earned)).length;
    }
    return { players: players.rows.length, awarded };
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

/**
 * Just the achievement ids this account has earned. Narrow because the avatar
 * gate asks on every save, and read LIVE so an unlock seconds ago counts.
 */
const earnedAchievementIds = async (userId) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const { rows } = await pgPool.query(
        'SELECT achievement_id FROM user_achievements WHERE user_id = $1',
        [userId],
    );
    return rows.map((row) => row.achievement_id);
};

/** One row's outward shape. The client keys its own copy the same way. */
const bestOf = (row) => ({
    boardKey: row.board_key,
    seconds: row.seconds,
    players: row.players,
    achievedAt: row.achieved_at,
});

/**
 * Just this account's board records — what the GAME loads, on the landing
 * page and on every board. Narrow, the same trade `earnedAchievementIds` makes.
 */
const getBoardBests = async (userId) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const { rows } = await pgPool.query(
        'SELECT board_key, seconds, players, achieved_at FROM user_board_bests WHERE user_id = $1 ORDER BY achieved_at DESC',
        [userId],
    );
    return rows.map(bestOf);
};

/** Everything the profile page shows, in one read. */
const getProfile = async (userId) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const [stats, bests, recent, daily, achievements] = await Promise.all([
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
        // Unbounded: never pruned, and a whole year is 365 tiny rows.
        pgPool.query(
            'SELECT day, won, duration_ms FROM user_daily_results WHERE user_id = $1 ORDER BY day ASC',
            [userId],
        ),
        // Newest first: the shelf's watermark is the first row's earned_at.
        pgPool.query(
            'SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = $1 ORDER BY earned_at DESC',
            [userId],
        ),
    ]);

    return {
        stats: snapshotOf(stats.rows[0]),
        boardBests: bests.rows.map(bestOf),
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
        achievements: achievements.rows.map((a) => ({
            id: a.achievement_id,
            earnedAt: a.earned_at,
        })),
    };
};

/**
 * The one-time guest import, keep-if-faster so it can only improve a profile
 * and re-importing is harmless. Client-reported numbers, accepted knowingly
 * (PRD): they seed a private profile, not a leaderboard.
 */
const importBests = async (userId, bests) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        for (const best of bests) {
            /*
             * Client-reported, so the two halves can disagree. The COUNT is the
             * trustworthy half (the browser files by it), so the key is rebuilt
             * from it and the column read back out of the rebuilt key.
             */
            const boardKey = withPlayers(boardPartOf(best.boardKey), best.players);
            await upsertBest(client, userId, { ...best, boardKey, players: playersFromKey(boardKey) });
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    recordResult,
    getProfile,
    getBoardBests,
    earnedAchievementIds,
    importBests,
    backfillAchievements,
    RECENT_WINDOW,
};
