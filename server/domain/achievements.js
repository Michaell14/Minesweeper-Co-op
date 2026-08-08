/**
 * Which achievements a player satisfies, given the aggregates after a game and
 * the game itself. Pure — the same reason `streak.js` is: threshold logic that
 * can only be observed through a database reports plausible wrong answers
 * forever.
 *
 * Returns everything CURRENTLY satisfied, not what changed. The caller inserts
 * with ON CONFLICT DO NOTHING and lets Postgres decide what is new, which is
 * also what makes counters retroactive for free: a player who qualified before
 * this feature existed collects on their next finished game, with no backfill
 * involved.
 *
 * Catalog and metric names live in `shared/achievements.js` — outside the
 * server's layer graph, like every other shared module.
 */

const {
    ACHIEVEMENTS,
    metricsFrom,
    difficultyTierOf,
    isPresetBoard,
    parseBoardKey,
} = require('../../shared/achievements');
const { BOARD_SIZES, sizePreset } = require('../../shared/boardConfig');

const LARGE = sizePreset('Large');
const FIVE_MINUTES = 5 * 60 * 1000;
const HALF_AN_HOUR = 30 * 60 * 1000;

/** Derived, not typed out: a new smallest size moves this with it. */
const SMALLEST_SHIPPED_AREA = Math.min(...BOARD_SIZES.map((size) => size.rows * size.cols));

/** Every moment describes a CLEARED board; a loss earns none of them. */
const onWin = (test) => (result) => result.won === true && test(result);

/** Faster than `limit`, and actually measured — a null duration is not a time. */
const under = (result, limit) => typeof result.durationMs === 'number' && result.durationMs < limit;

/**
 * At least as big as the smallest board the game offers.
 *
 * Difficulty is a DENSITY, so without a floor an 8x8 custom board with 13
 * mines tiers as Extreme and hands over the two hardest-sounding achievements
 * for a grid a quarter the size of the daily. Custom boards go down to 8x8,
 * which is below every shipped size — so this excludes only the degenerate
 * ones and nothing a player would reach by picking from the UI.
 */
const atLeastShippedSize = (result) => {
    const board = parseBoardKey(result.boardKey);
    return !!board && board.rows * board.cols >= SMALLEST_SHIPPED_AREA;
};

/**
 * One predicate per `moment: true` catalog entry, keyed by id. The catalog and
 * this table are checked against each other in `achievements.test.js` — a
 * moment with no predicate would otherwise be unearnable with nothing failing.
 */
const MOMENTS = Object.freeze({
    'extreme-measures': onWin((r) => difficultyTierOf(r.boardKey) === 'Extreme' && atLeastShippedSize(r)),

    'under-pressure': onWin(
        (r) => difficultyTierOf(r.boardKey) === 'Extreme' && atLeastShippedSize(r) && under(r, FIVE_MINUTES),
    ),

    'speed-demon': onWin((r) => r.boardKey === '16x16/40' && under(r, 90_000)),

    'blink': onWin((r) => r.boardKey === '9x9/10' && under(r, 15_000)),

    'crowd-work': onWin((r) => r.mode === 'co-op' && r.players >= 4),

    'solo-act': onWin((r) => {
        const board = parseBoardKey(r.boardKey);
        return r.players === 1 && !!board && !!LARGE && board.rows === LARGE.rows && board.cols === LARGE.cols;
    }),

    'custom-job': onWin((r) => !isPresetBoard(r.boardKey)),

    'century-of-mines': onWin((r) => (parseBoardKey(r.boardKey)?.mines ?? 0) >= 100),

    'long-haul': onWin((r) => typeof r.durationMs === 'number' && r.durationMs > HALF_AN_HOUR),
});

/**
 * Every achievement id the player now satisfies.
 *
 * @param stats  aggregates AFTER this result — camelCase, as getProfile shapes
 *               them (coopGames, coopWins, ..., bestStreak, dailyBestStreak)
 * @param result { mode, boardKey, won, durationMs|null, players }
 */
const earnedFrom = (stats, result) => {
    const metrics = metricsFrom(stats);
    const game = result || {};

    return ACHIEVEMENTS.filter((achievement) => {
        if (!achievement.moment) return (metrics[achievement.metric] ?? 0) >= achievement.threshold;
        /*
         * A moment with no predicate is skipped, not thrown on. This runs
         * inside recordResult's transaction, so a bare `MOMENTS[id](game)`
         * turns a catalog typo into a TypeError that rolls back the whole
         * result — the game row, the aggregates and the streak — for every
         * player, every game, logged only as a dropped stats write.
         * `achievements.test.js` still fails on the missing predicate.
         */
        const predicate = MOMENTS[achievement.id];
        return typeof predicate === 'function' && predicate(game) === true;
    }).map((achievement) => achievement.id);
};

module.exports = { earnedFrom, MOMENTS };
