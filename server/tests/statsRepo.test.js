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

/** A client that logs sql and can be told to fail on a matching statement. */
const makeClient = ({ failOn } = {}) => {
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

        // A fresh player's first win: 1 game, 1 win, streak 1.
        const stats = client.calls.find((c) => c.sql.includes('INSERT INTO user_stats') && !c.sql.includes('DO NOTHING'));
        expect(stats.sql).toContain('coop_games');
        expect(stats.params).toEqual(['uuid-1', 1, 1, 1, 1, '2026-08-02']);

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
                    }],
                };
            }
            return { rows: [], rowCount: 1 };
        });
        mockConnect.mockResolvedValue(client);

        await statsRepo.recordResult('uuid-1', RESULT);

        const stats = client.calls.find((c) => c.sql.includes('INSERT INTO user_stats') && !c.sql.includes('DO NOTHING'));
        expect(stats.params).toEqual(['uuid-1', 5, 3, 4, 6, '2026-08-02']);
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
