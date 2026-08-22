/**
 * The achievement catalog and its evaluator, both pure.
 *
 * What this is really guarding: an achievement that is quietly UNEARNABLE.
 * A moment with no predicate, a counter naming a metric nobody computes, a
 * threshold that fires one game late — none of those break anything loudly.
 * They just never happen, on a shelf whose whole job is to be reachable.
 *
 * The difficulty tier gets its own block because `mineCountFor` rounds, and
 * rounds DOWN past its own density for at least one shipped board.
 */

const {
    ACHIEVEMENTS,
    metricsFrom,
    difficultyTierOf,
    isPresetBoard,
    parseBoardKey,
    progressOf,
} = require('../../shared/achievements');
const { ALL_PRESETS, BOARD_SIZES, DIFFICULTY_LEVELS, mineCountFor } = require('../../shared/boardConfig');
const { earnedFrom, MOMENTS } = require('../domain/achievements');

/** A player who has done nothing. Spread over it to state only what matters. */
const NOBODY = {
    coopGames: 0, coopWins: 0,
    pvpGames: 0, pvpWins: 0,
    dailyGames: 0, dailyWins: 0,
    bestStreak: 0, dailyBestStreak: 0,
};

/** A finished game that earns no moment on its own. */
const PLAIN_WIN = {
    mode: 'co-op',
    boardKey: '16x16/40',
    won: true,
    durationMs: 300_000,
    players: 2,
};

describe('the catalog', () => {
    test('every id is unique', () => {
        const ids = ACHIEVEMENTS.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('every entry is displayable', () => {
        for (const achievement of ACHIEVEMENTS) {
            expect(typeof achievement.name).toBe('string');
            expect(achievement.name.length).toBeGreaterThan(0);
            expect(typeof achievement.description).toBe('string');
            expect(achievement.description.length).toBeGreaterThan(0);
        }
    });

    test('every entry is exactly one of counter or moment', () => {
        for (const achievement of ACHIEVEMENTS) {
            const isCounter = typeof achievement.metric === 'string';
            expect([achievement.id, isCounter !== achievement.moment]).toEqual([achievement.id, true]);
            if (isCounter) expect(Number.isInteger(achievement.threshold)).toBe(true);
        }
    });

    // The shapes are uniform so the client reads one type; every key is there.
    test('every entry carries the same keys', () => {
        const keys = Object.keys(ACHIEVEMENTS[0]).sort();
        for (const achievement of ACHIEVEMENTS) {
            expect([achievement.id, Object.keys(achievement).sort()]).toEqual([achievement.id, keys]);
        }
    });

    // A counter naming a metric nobody computes reads `undefined >= 10` — false
    // forever, on a tile that shows 0 / 10 and never moves.
    test('every counter names a metric the evaluator actually computes', () => {
        const computed = Object.keys(metricsFrom(NOBODY));
        for (const achievement of ACHIEVEMENTS.filter((a) => typeof a.metric === 'string')) {
            expect([achievement.id, computed]).toEqual([achievement.id, expect.arrayContaining([achievement.metric])]);
        }
    });

    // The one that stops a moment from being unreachable in silence.
    test('every moment has a predicate, and every predicate a catalog entry', () => {
        const moments = ACHIEVEMENTS.filter((a) => a.moment).map((a) => a.id).sort();
        expect(Object.keys(MOMENTS).sort()).toEqual(moments);
    });
});

describe('difficultyTierOf', () => {
    /**
     * The regression this file exists for. Large + Hard is 320 x 0.188 = 60.16,
     * rounded to 60 mines — a density of 0.1875, UNDER the 0.188 it came from.
     * A bare `>=` files it as Medium.
     */
    test('every shipped size/difficulty pair maps back to its own label', () => {
        for (const size of BOARD_SIZES) {
            for (const level of DIFFICULTY_LEVELS) {
                const mines = mineCountFor(size.rows, size.cols, level.title);
                const key = `${size.rows}x${size.cols}/${mines}`;
                expect([key, difficultyTierOf(key)]).toEqual([key, level.title]);
            }
        }
    });

    test('a board below Easy has no tier', () => {
        expect(difficultyTierOf('16x16/5')).toBeNull();
    });

    test('a malformed key is null rather than a guess', () => {
        expect(difficultyTierOf('nonsense')).toBeNull();
        expect(difficultyTierOf(undefined)).toBeNull();
        expect(parseBoardKey('16x16')).toBeNull();
    });
});

describe('isPresetBoard', () => {
    test('recognises every shipped combination', () => {
        for (const preset of ALL_PRESETS) {
            expect(isPresetBoard(`${preset.rows}x${preset.cols}/${preset.mines}`)).toBe(true);
        }
    });

    test('a hand-rolled board is not a preset', () => {
        expect(isPresetBoard('11x13/37')).toBe(false);
    });
});

describe('earnedFrom: counters', () => {
    test('a player who has done nothing earns nothing', () => {
        expect(earnedFrom(NOBODY, { ...PLAIN_WIN, won: false })).toEqual([]);
    });

    test('fires exactly at the threshold, not one game early', () => {
        const at = (totalWins) => earnedFrom({ ...NOBODY, coopWins: totalWins }, PLAIN_WIN);
        expect(at(9)).not.toContain('sweeper');
        expect(at(10)).toContain('sweeper');
        expect(at(11)).toContain('sweeper');
    });

    test('totals add up across modes', () => {
        const earned = earnedFrom({ ...NOBODY, coopWins: 4, pvpWins: 3, dailyWins: 3 }, PLAIN_WIN);
        expect(earned).toContain('sweeper');
    });

    test('triple-threat needs a win in all three modes', () => {
        expect(earnedFrom({ ...NOBODY, coopWins: 50, pvpWins: 50 }, PLAIN_WIN)).not.toContain('triple-threat');
        expect(
            earnedFrom({ ...NOBODY, coopWins: 1, pvpWins: 1, dailyWins: 1 }, PLAIN_WIN),
        ).toContain('triple-threat');
    });

    // A lapsed streak must not revoke a badge, so the rules read the BEST.
    test('streak badges read the best streak, not the current one', () => {
        const earned = earnedFrom(
            { ...NOBODY, bestStreak: 9, dailyBestStreak: 8, coopWins: 1 },
            PLAIN_WIN,
        );
        expect(earned).toContain('regular');
        expect(earned).toContain('week-streak');
        expect(earned).not.toContain('devotee');
    });

    test('counters ignore whether THIS game was won — they read the snapshot', () => {
        expect(earnedFrom({ ...NOBODY, coopWins: 10 }, { ...PLAIN_WIN, won: false })).toContain('sweeper');
    });

    test('showed-up counts games, not wins', () => {
        expect(earnedFrom({ ...NOBODY, coopGames: 50 }, PLAIN_WIN)).toContain('showed-up');
    });
});

describe('earnedFrom: moments', () => {
    const won = (result) => earnedFrom(NOBODY, { ...PLAIN_WIN, ...result });

    test('a loss earns no moment, however impressive the board', () => {
        expect(won({ boardKey: '16x16/53', durationMs: 10_000, won: false })).toEqual([]);
    });

    test('extreme-measures needs Extreme density', () => {
        expect(won({ boardKey: '16x16/53' })).toContain('extreme-measures');
        expect(won({ boardKey: '16x16/40' })).not.toContain('extreme-measures');
    });

    test('under-pressure needs Extreme AND the clock', () => {
        expect(won({ boardKey: '16x16/53', durationMs: 299_999 })).toContain('under-pressure');
        expect(won({ boardKey: '16x16/53', durationMs: 300_001 })).not.toContain('under-pressure');
        expect(won({ boardKey: '16x16/40', durationMs: 1_000 })).not.toContain('under-pressure');
    });

    /*
     * Difficulty is a DENSITY, so the two hardest-sounding achievements were
     * free on a custom board smaller than anything the UI offers: 8x8/13 tiers
     * as Extreme on a quarter of the daily's cells.
     */
    test('the Extreme moments need a board at least as big as the smallest shipped size', () => {
        const smallest = Math.min(...BOARD_SIZES.map((s) => s.rows * s.cols));
        expect(difficultyTierOf('8x8/13')).toBe('Extreme');
        expect(8 * 8).toBeLessThan(smallest);

        const tiny = won({ boardKey: '8x8/13', durationMs: 30_000 });
        expect(tiny).not.toContain('extreme-measures');
        expect(tiny).not.toContain('under-pressure');
    });

    // …and every shipped size at Extreme still counts, the smallest included.
    test('a shipped Extreme board still earns them at any size', () => {
        for (const size of BOARD_SIZES) {
            const mines = mineCountFor(size.rows, size.cols, 'Extreme');
            const key = `${size.rows}x${size.cols}/${mines}`;
            expect([key, won({ boardKey: key, durationMs: 30_000 })]).toEqual([
                key,
                expect.arrayContaining(['extreme-measures', 'under-pressure']),
            ]);
        }
    });

    test('speed-demon and blink are board-specific', () => {
        expect(won({ boardKey: '16x16/40', durationMs: 89_999 })).toContain('speed-demon');
        expect(won({ boardKey: '9x9/10', durationMs: 89_999 })).not.toContain('speed-demon');
        expect(won({ boardKey: '9x9/10', durationMs: 14_999 })).toContain('blink');
    });

    /*
     * Board-specific, not GROUP-specific. Records grew a player-count suffix so
     * a group clear stops taking the solo slot, and every predicate here asks
     * about the board — clearing 16x16/40 in 80 seconds is the same feat with
     * friends. An equality check against the whole key silently stopped
     * awarding these to co-op rooms the day the suffix arrived.
     */
    test('a group clear earns the same board moments as a solo one', () => {
        expect(won({ boardKey: '16x16/40@3', durationMs: 89_999, players: 3 })).toContain('speed-demon');
        expect(won({ boardKey: '9x9/10@2', durationMs: 14_999, players: 2 })).toContain('blink');
        expect(won({ boardKey: '16x16/100@4', durationMs: 30_000, players: 4 })).toEqual(
            expect.arrayContaining(['extreme-measures', 'century-of-mines']),
        );
        // …and a preset cleared by a group is still a preset.
        expect(won({ boardKey: '16x16/40@3', players: 3 })).not.toContain('custom-job');
    });

    // A null duration is not a fast time. Co-op rooms can lose their start stamp.
    test('an unmeasured clear earns no timed moment', () => {
        const earned = won({ boardKey: '16x16/40', durationMs: null });
        expect(earned).not.toContain('speed-demon');
        expect(earned).not.toContain('long-haul');
    });

    test('crowd-work is co-op with four or more', () => {
        expect(won({ mode: 'co-op', players: 4 })).toContain('crowd-work');
        expect(won({ mode: 'co-op', players: 3 })).not.toContain('crowd-work');
    });

    test('solo-act is a Large board alone', () => {
        expect(won({ boardKey: '20x16/50', players: 1 })).toContain('solo-act');
        expect(won({ boardKey: '20x16/50', players: 2 })).not.toContain('solo-act');
        expect(won({ boardKey: '16x16/40', players: 1 })).not.toContain('solo-act');
    });

    test('custom-job is any board that is not a preset', () => {
        expect(won({ boardKey: '11x13/37' })).toContain('custom-job');
        expect(won({ boardKey: '16x16/40' })).not.toContain('custom-job');
    });

    // The daily is a shipped preset (16x16 Extreme), so it must not read custom.
    test('a daily clear is not a custom board', () => {
        const { DAILY_PRESET } = require('../../shared/boardConfig');
        const key = `${DAILY_PRESET.rows}x${DAILY_PRESET.cols}/${DAILY_PRESET.mines}`;
        expect(won({ mode: 'daily', boardKey: key, players: 1 })).not.toContain('custom-job');
    });

    test('century-of-mines counts the mines', () => {
        expect(won({ boardKey: '32x16/105' })).toContain('century-of-mines');
        expect(won({ boardKey: '32x16/99' })).not.toContain('century-of-mines');
    });

    test('long-haul is a clear over half an hour', () => {
        expect(won({ durationMs: 1_800_001 })).toContain('long-haul');
        expect(won({ durationMs: 1_799_999 })).not.toContain('long-haul');
    });
});

describe('earnedFrom: shape', () => {
    test('returns everything satisfied, in catalog order, with no duplicates', () => {
        const earned = earnedFrom({ ...NOBODY, coopWins: 10 }, PLAIN_WIN);
        expect(new Set(earned).size).toBe(earned.length);

        const order = ACHIEVEMENTS.map((a) => a.id);
        const positions = earned.map((id) => order.indexOf(id));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(positions).not.toContain(-1);
    });

    // The caller inserts ON CONFLICT DO NOTHING, so re-satisfying is the norm.
    test('is a pure function of its inputs — the same snapshot answers the same', () => {
        const snapshot = { ...NOBODY, coopWins: 10 };
        expect(earnedFrom(snapshot, PLAIN_WIN)).toEqual(earnedFrom(snapshot, PLAIN_WIN));
    });

    test('survives a missing snapshot rather than throwing on a game path', () => {
        expect(earnedFrom(undefined, PLAIN_WIN)).toEqual([]);
        expect(earnedFrom(NOBODY, undefined)).toEqual([]);
    });

    /*
     * The parity test above stops a predicate-less moment reaching main. This
     * is what happens if one ever does: it runs inside recordResult's
     * transaction, so throwing would roll back the game row, the aggregates
     * and the streak — for every player, every game — surfacing only as a
     * dropped stats write. Skipping one unearnable badge is the cheap failure.
     */
    test('skips a moment with no predicate instead of throwing mid-transaction', () => {
        /*
         * The catalog has to be swapped BEFORE domain/achievements is loaded:
         * it destructures ACHIEVEMENTS at require time, so mutating the
         * exports object afterwards changes nothing and the test passes
         * against the unfixed code. Hence resetModules + doMock.
         */
        jest.resetModules();
        const real = jest.requireActual('../../shared/achievements');
        jest.doMock('../../shared/achievements', () => ({
            ...real,
            ACHIEVEMENTS: Object.freeze([
                ...real.ACHIEVEMENTS,
                { id: 'ghost', name: 'Ghost', description: 'x', metric: null, threshold: null, moment: true, hidden: false },
            ]),
        }));

        try {
            const { earnedFrom: withGhost } = require('../domain/achievements');
            expect(() => withGhost({ ...NOBODY, coopWins: 1 }, PLAIN_WIN)).not.toThrow();
            expect(withGhost({ ...NOBODY, coopWins: 1 }, PLAIN_WIN)).not.toContain('ghost');
        } finally {
            jest.dontMock('../../shared/achievements');
            jest.resetModules();
        }
    });
});

describe('progressOf', () => {
    test('reports a counter against its threshold, clamped', () => {
        const sweeper = ACHIEVEMENTS.find((a) => a.id === 'sweeper');
        expect(progressOf(sweeper, metricsFrom({ ...NOBODY, coopWins: 4 }))).toEqual({ value: 4, threshold: 10 });
        expect(progressOf(sweeper, metricsFrom({ ...NOBODY, coopWins: 99 }))).toEqual({ value: 10, threshold: 10 });
    });

    test('a moment has no progress to show', () => {
        const blink = ACHIEVEMENTS.find((a) => a.id === 'blink');
        expect(progressOf(blink, metricsFrom(NOBODY))).toBeNull();
    });
});
