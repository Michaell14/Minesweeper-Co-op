/**
 * The stats transaction, against a fake pool client that records every
 * statement. What must hold: the four writes share one BEGIN/COMMIT, an error
 * anywhere ROLLS BACK (an aggregate without its result row is a lie), the
 * prune keeps the window, and only faster wins touch the bests.
 */

const mockConnect = jest.fn();
jest.mock('../utils/initializePgClient', () => ({
    pgPool: { connect: (...args) => mockConnect(...args), query: jest.fn() },
    isDbEnabled: () => true,
    query: jest.fn(),
}));

const statsRepo = require('../data/statsRepo');
const { ACHIEVEMENTS } = require('../../shared/achievements');

/**
 * A client that logs sql and can be told to fail on a matching statement.
 * `wonDays` answers the daily-streak derivation SELECT, newest first — the
 * fake stands in for the table state AFTER the calendar upsert. `unlocked`
 * answers the achievement insert's RETURNING, which real Postgres narrows to
 * the rows ON CONFLICT actually let through.
 */
const makeClient = ({ failOn, wonDays = [], unlocked = [] } = {}) => {
    const calls = [];
    const client = {
        calls,
        released: false,
        query: jest.fn(async (sql, params) => {
            calls.push({ sql, params });
            if (failOn && sql.includes(failOn)) throw new Error(`boom on ${failOn}`);
            if (sql.includes('FOR UPDATE')) {
                return { rows: [] }; // fresh player by default
            }
            if (sql.includes('SELECT day FROM user_daily_results')) {
                return { rows: wonDays.map((day) => ({ day })) };
            }
            if (sql.includes('INSERT INTO user_achievements')) {
                return { rows: unlocked.map((achievement_id) => ({ achievement_id })) };
            }
            return { rows: [], rowCount: 1 };
        }),
        release: jest.fn(() => { client.released = true; }),
    };
    return client;
};

const RESULT = {
    mode: 'co-op',
    boardKey: '16x16/40',
    won: true,
    durationMs: 92_500,
    players: 3,
    finishedAt: Date.UTC(2026, 7, 2, 12, 0, 0),
};

beforeEach(() => mockConnect.mockReset());

describe('recordResult', () => {
    test('wraps result, prune, aggregates and best in one transaction', async () => {
        const client = makeClient();
        mockConnect.mockResolvedValue(client);

        await statsRepo.recordResult('uuid-1', RESULT);

        const sqls = client.calls.map((c) => c.sql);
        expect(sqls[0]).toBe('BEGIN');
        expect(sqls[sqls.length - 1]).toBe('COMMIT');
        expect(sqls.some((s) => s.includes('INSERT INTO game_results'))).toBe(true);
        expect(sqls.some((s) => s.includes('DELETE FROM game_results'))).toBe(true);
        // The seed insert precedes the FOR UPDATE read — locking an absent row
        // locks nothing, and first-ever concurrent results would race.
        const seedIndex = sqls.findIndex((s) => s.includes('DO NOTHING'));
        const lockIndex = sqls.findIndex((s) => s.includes('FOR UPDATE'));
        expect(seedIndex).toBeGreaterThan(-1);
        expect(seedIndex).toBeLessThan(lockIndex);
        expect(sqls.some((s) => s.includes('INSERT INTO user_stats') && !s.includes('DO NOTHING'))).toBe(true);
        expect(sqls.some((s) => s.includes('INSERT INTO user_board_bests'))).toBe(true);
        expect(client.released).toBe(true);

        // The prune keeps the recent window.
        const prune = client.calls.find((c) => c.sql.includes('DELETE FROM game_results'));
        expect(prune.params).toEqual(['uuid-1', statsRepo.RECENT_WINDOW]);

        // A fresh player's first win: 1 game, 1 win, streak 1; the daily
        // triple rides along untouched for a co-op result.
        const stats = client.calls.find((c) => c.sql.includes('INSERT INTO user_stats') && !c.sql.includes('DO NOTHING'));
        expect(stats.sql).toContain('coop_games');
        expect(stats.params).toEqual(['uuid-1', 1, 1, 1, 1, '2026-08-02', 0, 0, null]);

        // …and a co-op result never touches the daily calendar.
        expect(sqls.some((s) => s.includes('user_daily_results'))).toBe(false);

        // Best in floored seconds, keep-if-faster.
        const best = client.calls.find((c) => c.sql.includes('user_board_bests'));
        expect(best.sql).toMatch(/WHERE EXCLUDED\.seconds < user_board_bests\.seconds/);
        expect(best.params[2]).toBe(92);
    });

    test('a loss records no board best', async () => {
        const client = makeClient();
        mockConnect.mockResolvedValue(client);
        await statsRepo.recordResult('uuid-1', { ...RESULT, won: false });
        expect(client.calls.some((c) => c.sql.includes('user_board_bests'))).toBe(false);
        // …but the game still counts, with zero wins.
        const stats = client.calls.find((c) => c.sql.includes('INSERT INTO user_stats') && !c.sql.includes('DO NOTHING'));
        expect(stats.params[1]).toBe(1); // games
        expect(stats.params[2]).toBe(0); // wins
    });

    test('a win with no measurable duration records no best either', async () => {
        const client = makeClient();
        mockConnect.mockResolvedValue(client);
        await statsRepo.recordResult('uuid-1', { ...RESULT, durationMs: null });
        expect(client.calls.some((c) => c.sql.includes('user_board_bests'))).toBe(false);
    });

    test('extends the streak read under lock', async () => {
        const client = makeClient();
        client.query.mockImplementation(async (sql, params) => {
            client.calls.push({ sql, params });
            if (sql.includes('FOR UPDATE')) {
                return {
                    rows: [{
                        coop_games: 4, coop_wins: 2,
                        pvp_games: 0, pvp_wins: 0,
                        daily_games: 1, daily_wins: 1,
                        current_streak: 3, best_streak: 6,
                        last_played_day: '2026-08-01', // yesterday
                        daily_current_streak: 2, daily_best_streak: 5,
                        last_daily_day: '2026-07-30',
                    }],
                };
            }
            return { rows: [], rowCount: 1 };
        });
        mockConnect.mockResolvedValue(client);

        await statsRepo.recordResult('uuid-1', RESULT);

        const stats = client.calls.find((c) => c.sql.includes('INSERT INTO user_stats') && !c.sql.includes('DO NOTHING'));
        expect(stats.params).toEqual(['uuid-1', 5, 3, 4, 6, '2026-08-02', 2, 5, '2026-07-30']);
    });

    test('any failure rolls the whole transaction back', async () => {
        const client = makeClient({ failOn: 'user_stats' });
        mockConnect.mockResolvedValue(client);

        await expect(statsRepo.recordResult('uuid-1', RESULT)).rejects.toThrow('boom');

        const sqls = client.calls.map((c) => c.sql);
        expect(sqls).toContain('ROLLBACK');
        expect(sqls).not.toContain('COMMIT');
        expect(client.released).toBe(true);
    });

    test('refuses a mode it does not know rather than inventing columns', async () => {
        await expect(
            statsRepo.recordResult('uuid-1', { ...RESULT, mode: 'battle-royale' }),
        ).rejects.toThrow(/Unknown mode/);
        expect(mockConnect).not.toHaveBeenCalled();
    });
});

describe('recordResult: the daily calendar and clear streak', () => {
    const DAILY_RESULT = {
        mode: 'daily',
        boardKey: '9x9/16',
        won: true,
        durationMs: 92_500,
        players: 1,
        finishedAt: Date.UTC(2026, 7, 2, 12, 0, 0),
        dailyDate: '2026-08-02',
    };

    test('a daily win writes the calendar row in the same transaction and starts the clear streak', async () => {
        const client = makeClient({ wonDays: ['2026-08-02'] });
        mockConnect.mockResolvedValue(client);

        await statsRepo.recordResult('uuid-1', DAILY_RESULT);

        const sqls = client.calls.map((c) => c.sql);
        expect(sqls[0]).toBe('BEGIN');
        expect(sqls[sqls.length - 1]).toBe('COMMIT');

        const calendar = client.calls.find((c) => c.sql.includes('INSERT INTO user_daily_results'));
        expect(calendar).toBeDefined();
        // A loss must never downgrade a win, and only a faster win replaces one.
        expect(calendar.sql).toMatch(/WHERE EXCLUDED\.won/);
        expect(calendar.params).toEqual(['uuid-1', '2026-08-02', true, 92_500, DAILY_RESULT.finishedAt]);

        // The upsert must precede the stats write: the streak is derived from
        // the table, so the new row has to be in it before the SELECT.
        const upsertIndex = sqls.findIndex((s) => s.includes('INSERT INTO user_daily_results'));
        const selectIndex = sqls.findIndex((s) => s.includes('SELECT day FROM user_daily_results'));
        const statsIndex = sqls.findIndex((s) => s.includes('INSERT INTO user_stats') && !s.includes('DO NOTHING'));
        expect(upsertIndex).toBeLessThan(selectIndex);
        expect(selectIndex).toBeLessThan(statsIndex);

        // Fresh player: daily clear streak starts at 1, dated by the puzzle.
        const stats = client.calls[statsIndex];
        expect(stats.params.slice(6)).toEqual([1, 1, '2026-08-02']);
    });

    test('a daily loss lands on the calendar but never touches the clear streak', async () => {
        const client = makeClient();
        mockConnect.mockResolvedValue(client);

        await statsRepo.recordResult('uuid-1', { ...DAILY_RESULT, won: false });

        const calendar = client.calls.find((c) => c.sql.includes('INSERT INTO user_daily_results'));
        expect(calendar.params[2]).toBe(false);

        // No derivation on a loss: the won-days set did not change.
        expect(client.calls.some((c) => c.sql.includes('SELECT day FROM user_daily_results'))).toBe(false);
        const stats = client.calls.find((c) => c.sql.includes('INSERT INTO user_stats') && !c.sql.includes('DO NOTHING'));
        expect(stats.params.slice(6)).toEqual([0, 0, null]);
    });

    test('an out-of-order win repairs the streak the calendar shows', async () => {
        // Won the 1st and (already recorded) the 3rd; the leftover 2nd lands
        // last, finished days later. Derived from the table, the answer is a
        // 3-run keyed by puzzle dates — finishedAt plays no part, and the gap
        // an accumulator would have locked in gets healed.
        const client = makeClient({ wonDays: ['2026-08-03', '2026-08-02', '2026-08-01'] });
        mockConnect.mockResolvedValue(client);

        await statsRepo.recordResult('uuid-1', {
            ...DAILY_RESULT,
            finishedAt: Date.UTC(2026, 7, 4, 3, 0, 0),
        });

        const stats = client.calls.find((c) => c.sql.includes('INSERT INTO user_stats') && !c.sql.includes('DO NOTHING'));
        expect(stats.params.slice(6)).toEqual([3, 3, '2026-08-03']);
    });

    test('a daily result missing its date still records everything else', async () => {
        const client = makeClient();
        mockConnect.mockResolvedValue(client);

        await statsRepo.recordResult('uuid-1', { ...DAILY_RESULT, dailyDate: undefined });

        const sqls = client.calls.map((c) => c.sql);
        expect(sqls.some((s) => s.includes('user_daily_results'))).toBe(false);
        expect(sqls.some((s) => s.includes('INSERT INTO game_results'))).toBe(true);
        expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });

    test('a calendar-write failure rolls back the whole result', async () => {
        const client = makeClient({ failOn: 'user_daily_results' });
        mockConnect.mockResolvedValue(client);

        await expect(statsRepo.recordResult('uuid-1', DAILY_RESULT)).rejects.toThrow('boom');

        const sqls = client.calls.map((c) => c.sql);
        expect(sqls).toContain('ROLLBACK');
        expect(sqls).not.toContain('COMMIT');
    });
});

describe('recordResult: achievements', () => {
    test('awards inside the same transaction, from the aggregates just written', async () => {
        const client = makeClient({ unlocked: ['first-clear'] });
        mockConnect.mockResolvedValue(client);

        const unlocked = await statsRepo.recordResult('uuid-1', RESULT);

        const sqls = client.calls.map((c) => c.sql);
        const award = client.calls.find((c) => c.sql.includes('INSERT INTO user_achievements'));
        expect(award).toBeDefined();
        expect(sqls.indexOf(award.sql)).toBeLessThan(sqls.indexOf('COMMIT'));

        // The snapshot counts THIS result: a fresh player's first win is a win.
        expect(award.params[0]).toBe('uuid-1');
        expect(award.params[1]).toContain('first-clear');

        // Re-awarding is Postgres's problem, not ours.
        expect(award.sql).toMatch(/ON CONFLICT DO NOTHING/);
        expect(award.sql).toMatch(/RETURNING achievement_id/);

        // Only what RETURNING gave back is new — the rest were already held.
        expect(unlocked).toEqual(['first-clear']);
    });

    test('reports nothing new when the insert conflicts on everything', async () => {
        const client = makeClient({ unlocked: [] });
        mockConnect.mockResolvedValue(client);
        await expect(statsRepo.recordResult('uuid-1', RESULT)).resolves.toEqual([]);
    });

    test('a moment reads the game, not the aggregates', async () => {
        const client = makeClient({ unlocked: ['speed-demon'] });
        mockConnect.mockResolvedValue(client);

        await statsRepo.recordResult('uuid-1', { ...RESULT, boardKey: '16x16/40', durationMs: 45_000 });

        const award = client.calls.find((c) => c.sql.includes('INSERT INTO user_achievements'));
        expect(award.params[1]).toContain('speed-demon');
    });

    test('a first-ever LOSS earns nothing and skips the statement entirely', async () => {
        const client = makeClient();
        mockConnect.mockResolvedValue(client);

        await expect(
            statsRepo.recordResult('uuid-1', { ...RESULT, won: false }),
        ).resolves.toEqual([]);
        expect(client.calls.some((c) => c.sql.includes('user_achievements'))).toBe(false);
    });

    test('an achievement cannot survive a rolled-back result', async () => {
        const client = makeClient({ failOn: 'user_board_bests' });
        mockConnect.mockResolvedValue(client);

        await expect(statsRepo.recordResult('uuid-1', RESULT)).rejects.toThrow('boom');

        const sqls = client.calls.map((c) => c.sql);
        expect(sqls.some((s) => s.includes('user_achievements'))).toBe(true);
        expect(sqls).toContain('ROLLBACK');
        expect(sqls).not.toContain('COMMIT');
    });
});

describe('getProfile', () => {
    const poolQuery = require('../utils/initializePgClient').pgPool.query;

    beforeEach(() => poolQuery.mockReset());

    test('reads the daily history alongside the rest, oldest first', async () => {
        poolQuery.mockImplementation(async (sql) => {
            if (sql.includes('FROM user_stats')) {
                return {
                    rows: [{
                        coop_games: 1, coop_wins: 1, pvp_games: 0, pvp_wins: 0,
                        daily_games: 2, daily_wins: 1, current_streak: 1,
                        best_streak: 2, last_played_day: '2026-08-02',
                        daily_current_streak: 1, daily_best_streak: 2,
                        last_daily_day: '2026-08-02',
                    }],
                };
            }
            if (sql.includes('FROM user_daily_results')) {
                expect(sql).toMatch(/ORDER BY day ASC/);
                return {
                    rows: [
                        { day: '2026-08-01', won: false, duration_ms: null },
                        { day: '2026-08-02', won: true, duration_ms: 92_500 },
                    ],
                };
            }
            return { rows: [] };
        });

        const profile = await statsRepo.getProfile('uuid-1');

        expect(profile.stats.dailyCurrentStreak).toBe(1);
        expect(profile.stats.dailyBestStreak).toBe(2);
        expect(profile.stats.lastDailyDay).toBe('2026-08-02');
        expect(profile.dailyHistory).toEqual([
            { day: '2026-08-01', won: false, durationMs: null },
            { day: '2026-08-02', won: true, durationMs: 92_500 },
        ]);
    });

    test('reads the achievement shelf newest first', async () => {
        poolQuery.mockImplementation(async (sql) => {
            if (sql.includes('FROM user_achievements')) {
                // The shelf's "new since you last looked" watermark is the
                // first row, so the ordering is contract, not presentation.
                expect(sql).toMatch(/ORDER BY earned_at DESC/);
                return {
                    rows: [
                        { achievement_id: 'sweeper', earned_at: '2026-08-08T12:00:00.000Z' },
                        { achievement_id: 'first-clear', earned_at: '2026-08-01T09:00:00.000Z' },
                    ],
                };
            }
            return { rows: [] };
        });

        const profile = await statsRepo.getProfile('uuid-1');

        expect(profile.achievements).toEqual([
            { id: 'sweeper', earnedAt: '2026-08-08T12:00:00.000Z' },
            { id: 'first-clear', earnedAt: '2026-08-01T09:00:00.000Z' },
        ]);
    });

    test('a player with no rows anywhere gets zeros and empty lists', async () => {
        poolQuery.mockResolvedValue({ rows: [] });

        const profile = await statsRepo.getProfile('uuid-1');

        expect(profile.stats.dailyCurrentStreak).toBe(0);
        expect(profile.stats.dailyBestStreak).toBe(0);
        expect(profile.stats.lastDailyDay).toBeNull();
        expect(profile.dailyHistory).toEqual([]);
        expect(profile.achievements).toEqual([]);
    });
});

describe('backfillAchievements', () => {
    const poolQuery = require('../utils/initializePgClient').pgPool.query;

    beforeEach(() => poolQuery.mockReset());

    /** Rows as pg hands them back: snake_case, straight off user_stats. */
    const statsRow = (user_id, overrides = {}) => ({
        user_id,
        coop_games: 0, coop_wins: 0,
        pvp_games: 0, pvp_wins: 0,
        daily_games: 0, daily_wins: 0,
        current_streak: 0, best_streak: 0, last_played_day: null,
        daily_current_streak: 0, daily_best_streak: 0, last_daily_day: null,
        ...overrides,
    });

    const runWith = async (rows, insertedPerCall = () => []) => {
        let call = 0;
        const awards = [];
        poolQuery.mockImplementation(async (sql, params) => {
            if (sql.includes('FROM user_stats')) return { rows };
            awards.push(params);
            return { rows: insertedPerCall(call++).map((achievement_id) => ({ achievement_id })) };
        });
        const summary = await statsRepo.backfillAchievements();
        return { summary, awards };
    };

    test('awards each player what their aggregates already satisfy', async () => {
        const { summary, awards } = await runWith(
            [statsRow('uuid-1', { coop_wins: 12, coop_games: 20 })],
            () => ['first-clear', 'sweeper'],
        );

        expect(awards).toHaveLength(1);
        expect(awards[0][0]).toBe('uuid-1');
        expect(awards[0][1]).toEqual(expect.arrayContaining(['first-clear', 'sweeper']));
        expect(summary).toEqual({ players: 1, awarded: 2 });
    });

    /*
     * The property that keeps a backfill honest. Moments describe one game,
     * and there is no game here — evaluating with no result must not manage to
     * hand out a clear nobody made.
     */
    test('never awards a moment, however decorated the player', async () => {
        const { awards } = await runWith([
            statsRow('uuid-1', {
                coop_wins: 400, pvp_wins: 400, daily_wins: 400,
                coop_games: 400, pvp_games: 400, daily_games: 400,
                best_streak: 99, daily_best_streak: 99,
            }),
        ]);

        const momentIds = ACHIEVEMENTS.filter((a) => a.moment).map((a) => a.id);
        expect(awards[0][1].filter((id) => momentIds.includes(id))).toEqual([]);
        // …and it did award the counters, so the assertion above means something.
        expect(awards[0][1]).toContain('field-marshal');
    });

    test('skips a player who has earned nothing rather than writing an empty set', async () => {
        const { summary, awards } = await runWith([statsRow('uuid-1')]);
        expect(awards).toEqual([]);
        expect(summary).toEqual({ players: 1, awarded: 0 });
    });

    // Re-running is expected: the script is one-shot but idempotent.
    test('counts only what ON CONFLICT actually let through', async () => {
        const { summary } = await runWith(
            [statsRow('uuid-1', { coop_wins: 12 }), statsRow('uuid-2', { coop_wins: 1 })],
            (call) => (call === 0 ? ['sweeper'] : []),
        );
        expect(summary).toEqual({ players: 2, awarded: 1 });
    });
});

describe('importBests', () => {
    test('runs every upsert inside one transaction', async () => {
        const client = makeClient();
        mockConnect.mockResolvedValue(client);

        await statsRepo.importBests('uuid-1', [
            { boardKey: '9x9/10', seconds: 30, players: 1, achievedAt: 1 },
            { boardKey: '16x16/40', seconds: 99, players: 2, achievedAt: 2 },
        ]);

        const sqls = client.calls.map((c) => c.sql);
        expect(sqls[0]).toBe('BEGIN');
        expect(sqls.filter((s) => s.includes('user_board_bests'))).toHaveLength(2);
        expect(sqls[sqls.length - 1]).toBe('COMMIT');
    });
});
