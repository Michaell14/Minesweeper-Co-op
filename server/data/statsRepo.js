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
const { earnedFrom } = require('../domain/achievements');

/** How many recent games each player keeps, per the PRD (aggregates + window). */
const RECENT_WINDOW = 50;

/** Mode → user_stats column prefix. Modes come from our own call sites. */
const MODE_COLUMNS = { 'co-op': 'coop', pvp: 'pvp', daily: 'daily' };

/**
 * A user_stats row in the shape everything above the database speaks — the
 * profile payload, and the snapshot achievements are evaluated against. One
 * mapping, because two would let the thresholds a player is awarded on and the
 * progress they are shown disagree.
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
 * @param userId  the account (callers have already resolved and null-checked)
 * @param result  { mode, boardKey, won, durationMs|null, players, finishedAt,
 *                  dailyDate? } — dailyDate is the daily's PUZZLE date
 *                  ('YYYY-MM-DD' UTC), the calendar key; see the migration.
 * @returns the achievement ids newly earned by this result (often empty).
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

        // Achievements, from the aggregates just written plus this game. The
        // evaluator returns everything CURRENTLY satisfied rather than a diff,
        // so ON CONFLICT decides what is actually new and RETURNING hands back
        // exactly that — one statement, no SELECT, and re-running a result
        // awards nothing twice. In the transaction because an achievement
        // without the result that earned it is the same lie as a stray
        // aggregate.
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

        // A board best is a WIN with a measured time; keep only if faster.
        // A PVP race counts as SOLO work for the record — the opponent never
        // touches your board — matching lib/bestTimes.ts's playersForClear.
        if (won && typeof durationMs === 'number' && durationMs >= 0) {
            await upsertBest(client, userId, {
                boardKey,
                seconds: Math.floor(durationMs / 1000),
                players: mode === 'pvp' ? 1 : players,
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
 * Awards a set of achievement ids, returning only the ones that were actually
 * new. ON CONFLICT decides that, and RETURNING reports it — so no read comes
 * first, re-awarding is a no-op, and two concurrent results cannot both claim
 * to have unlocked the same badge. `client` may be a pool or a transaction
 * client.
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
 * One-shot: award every counter each existing player already qualifies for.
 *
 * Not needed for correctness — the evaluator reads a snapshot, so anyone who
 * qualified collects on their next finished game anyway. This exists so the
 * shelf is not blank on the day it ships, for players who have not come back
 * yet. Idempotent, and safe to re-run.
 *
 * Moments are deliberately unreachable here: it evaluates with NO result, and
 * every moment predicate requires a win, so none can fire. They describe a
 * single game and `game_results` keeps only the recent window — there is
 * nothing to reconstruct them from, and inventing one would be a lie about
 * something a player never did.
 *
 * **Shaped for a one-off, and only that.** It reads every user_stats row into
 * memory and then makes one round-trip per player, sequentially. That is fine
 * for a hand-run script against this table and would not be fine for anything
 * scheduled or request-driven — batch the ids and page the scan before reusing
 * this shape.
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

/**
 * The canonical bests key: the board part plus a `@players` suffix for group
 * clears — the identity lib/bestTimes.ts files under, so both sides of the
 * sync agree on which record is "the" record. Derived from the entry's OWN
 * player count, never trusted from the key handed in — the same rule the
 * client applies on read and write.
 */
const bestKeyOf = (boardKey, players) => {
    const boardPart = String(boardKey).split('@')[0];
    return players > 1 ? `${boardPart}@${players}` : boardPart;
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
        [userId, bestKeyOf(boardKey, players), seconds, players, achievedAt],
    );

/**
 * Just the bests, for the sign-in sync — getProfile reads five tables the
 * sync has no use for. Keys are re-canonicalised on the way out, so a stale
 * bare group row (see refileLegacyBests) never reaches a client as solo.
 */
const getBests = async (userId) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');
    const result = await pgPool.query(
        'SELECT board_key, seconds, players, achieved_at FROM user_board_bests WHERE user_id = $1 ORDER BY achieved_at DESC',
        [userId],
    );
    return result.rows.map((b) => ({
        boardKey: bestKeyOf(b.board_key, b.players),
        seconds: b.seconds,
        players: b.players,
        achievedAt: b.achieved_at,
    }));
};

/**
 * Sweeps rows an old dyno wrote bare during a deploy window onto their
 * canonical keys — the release-phase migration cannot catch writes that land
 * after it runs, and a bare group row otherwise shadows the solo slot
 * indefinitely (keep-if-faster never displaces it). Idempotent; run at boot.
 */
const refileLegacyBests = async () => {
    if (!pgPool) return;
    await pgPool.query(`
        WITH moved AS (
            DELETE FROM user_board_bests
            WHERE players > 1 AND position('@' in board_key) = 0
            RETURNING user_id, board_key, seconds, players, achieved_at
        )
        INSERT INTO user_board_bests (user_id, board_key, seconds, players, achieved_at)
        SELECT user_id, board_key || '@' || players, seconds, players, achieved_at
        FROM moved
        ON CONFLICT (user_id, board_key) DO UPDATE SET
            seconds = EXCLUDED.seconds,
            players = EXCLUDED.players,
            achieved_at = EXCLUDED.achieved_at
        WHERE EXCLUDED.seconds < user_board_bests.seconds
    `);
};

/** Everything the profile page shows, in one read. */
const getProfile = async (userId) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const [stats, boardBests, recent, daily, achievements] = await Promise.all([
        pgPool.query('SELECT * FROM user_stats WHERE user_id = $1', [userId]),
        getBests(userId),
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
        // Newest first: the shelf's "new since you last looked" watermark is
        // the first row's earned_at, so the order is part of the contract.
        pgPool.query(
            'SELECT achievement_id, earned_at FROM user_achievements WHERE user_id = $1 ORDER BY earned_at DESC',
            [userId],
        ),
    ]);

    return {
        stats: snapshotOf(stats.rows[0]),
        boardBests,
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
 * The sync's push: a browser's localStorage bests folded in, keep-if-faster —
 * a push can only improve a PRIVATE profile, and re-pushing is harmless.
 * One multi-row statement, not a loop: this runs automatically at sign-in and
 * must not hold a pooled client for up to a hundred round-trips. Deduped by
 * canonical key first — two client entries can collapse to one key, which a
 * multi-row ON CONFLICT refuses to touch twice.
 */
const importBests = async (userId, bests) => {
    if (!pgPool) throw new Error('Postgres is not configured (DATABASE_URL is unset)');

    const byKey = new Map();
    for (const best of bests) {
        const boardKey = bestKeyOf(best.boardKey, best.players);
        const current = byKey.get(boardKey);
        if (!current || best.seconds < current.seconds) byKey.set(boardKey, { ...best, boardKey });
    }
    const rows = [...byKey.values()];
    if (rows.length === 0) return;

    await pgPool.query(
        `INSERT INTO user_board_bests (user_id, board_key, seconds, players, achieved_at)
         SELECT $1, key, secs, count, to_timestamp(achieved / 1000.0)
         FROM unnest($2::text[], $3::int[], $4::int[], $5::double precision[])
             AS entry(key, secs, count, achieved)
         ON CONFLICT (user_id, board_key) DO UPDATE SET
             seconds = EXCLUDED.seconds,
             players = EXCLUDED.players,
             achieved_at = EXCLUDED.achieved_at
         WHERE EXCLUDED.seconds < user_board_bests.seconds`,
        [
            userId,
            rows.map((r) => r.boardKey),
            rows.map((r) => r.seconds),
            rows.map((r) => r.players),
            rows.map((r) => r.achievedAt),
        ],
    );
};

module.exports = {
    recordResult,
    getProfile,
    getBests,
    importBests,
    refileLegacyBests,
    backfillAchievements,
    RECENT_WINDOW,
};
