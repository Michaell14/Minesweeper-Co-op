/**
 * The achievement catalog — the one copy, imported by BOTH halves: the client
 * via `@/shared/achievements`, the server via `require('../../shared/achievements')`.
 * CommonJS for the same reason as boardConfig and events — see ARCHITECTURE.md §6.
 *
 * ## Why the catalog is shared, and declarative
 *
 * The client has to render LOCKED achievements and their progress, not just
 * earned ones, or the shelf only ever shows what you already have. So a
 * `counter` entry carries its metric and threshold as data: the client computes
 * `7 / 25` from the stats payload it already fetches, and the server evaluates
 * `metric >= threshold` from the same two fields. One rule, no second endpoint,
 * nothing to keep in step by hand.
 *
 * A `moment` entry is a predicate over one finished game — too varied to encode
 * as data, and there is no progress to show. Its predicate lives server-side in
 * `server/domain/achievements.js`, keyed by id; `achievements.test.js` fails if
 * the two sets ever disagree.
 *
 * `Object.freeze` for the same reason `shared/events.js` freezes: it makes
 * TypeScript infer the literal ids rather than widening them to `string`.
 */

const { ALL_PRESETS, DIFFICULTY_LEVELS } = require('./boardConfig');

/**
 * Every metric a `counter` may name, and their values for a stats snapshot —
 * the shape `getProfile` returns, which is also what the server assembles
 * mid-transaction. Shared so the progress the client draws and the threshold
 * the server awards on cannot drift.
 *
 * The metric NAMES are this function's keys; there is no separate list to keep
 * in step. Five are `user_stats` columns under the names the profile payload
 * already uses, so both halves read them off the same object; three are
 * derived here.
 *
 * Streaks are the BEST, never the current one — a lapsed streak must not
 * revoke a badge someone earned.
 */
const metricsFrom = (stats) => {
    const s = stats || {};
    const coopWins = s.coopWins || 0;
    const pvpWins = s.pvpWins || 0;
    const dailyWins = s.dailyWins || 0;
    return {
        totalGames: (s.coopGames || 0) + (s.pvpGames || 0) + (s.dailyGames || 0),
        totalWins: coopWins + pvpWins + dailyWins,
        coopWins,
        pvpWins,
        dailyWins,
        bestStreak: s.bestStreak || 0,
        dailyBestStreak: s.dailyBestStreak || 0,
        modesWon: [coopWins, pvpWins, dailyWins].filter((wins) => wins > 0).length,
    };
};

/*
 * Both kinds carry the same KEYS, differing only in their values. The two
 * shapes are one TypeScript type that way, so the client can read
 * `achievement.hidden` on any entry rather than narrowing a union at every
 * call site — worth the two null fields a moment carries.
 */
const counter = (id, name, description, metric, threshold) =>
    Object.freeze({ id, name, description, metric, threshold, moment: false, hidden: false });

const moment = (id, name, description, options = {}) =>
    Object.freeze({
        id,
        name,
        description,
        metric: null,
        threshold: null,
        moment: true,
        hidden: options.hidden === true,
    });

/**
 * The catalog. Order is display order.
 *
 * Counters are retroactive by construction: the evaluator reads a SNAPSHOT
 * rather than a delta, so a returning player's next finished game grants
 * everything they already qualified for. Moments are not — they describe a
 * single game, and `game_results` only keeps the recent window.
 */
const ACHIEVEMENTS = Object.freeze([
    counter('first-clear', 'First Clear', 'Clear your first board.', 'totalWins', 1),
    counter('sweeper', 'Sweeper', 'Clear 10 boards.', 'totalWins', 10),
    counter('veteran', 'Veteran Sweeper', 'Clear 100 boards.', 'totalWins', 100),
    counter('field-marshal', 'Field Marshal', 'Clear 500 boards.', 'totalWins', 500),
    counter('showed-up', 'Showed Up', 'Finish 50 games, win or lose.', 'totalGames', 50),

    counter('team-player', 'Team Player', 'Win 10 co-op games.', 'coopWins', 10),
    counter('fully-cooperative', 'Fully Cooperative', 'Win 50 co-op games.', 'coopWins', 50),

    counter('duelist', 'Duelist', 'Win 5 races.', 'pvpWins', 5),
    counter('rival', 'Rival', 'Win 25 races.', 'pvpWins', 25),
    counter('apex-predator', 'Apex Predator', 'Win 100 races.', 'pvpWins', 100),

    counter('daily-habit', 'Daily Habit', 'Clear 7 daily puzzles.', 'dailyWins', 7),
    counter('daily-century', 'Hundred Days', 'Clear 100 daily puzzles.', 'dailyWins', 100),
    counter('week-streak', 'Seven Straight', 'Clear the daily 7 days running.', 'dailyBestStreak', 7),
    counter('month-streak', 'Thirty Straight', 'Clear the daily 30 days running.', 'dailyBestStreak', 30),

    counter('regular', 'Regular', 'Play 7 days running.', 'bestStreak', 7),
    counter('devotee', 'Devotee', 'Play 30 days running.', 'bestStreak', 30),
    counter('triple-threat', 'Triple Threat', 'Win in co-op, in a race, and on the daily.', 'modesWon', 3),

    moment('extreme-measures', 'Extreme Measures', 'Clear a board at Extreme density.'),
    moment('under-pressure', 'Under Pressure', 'Clear an Extreme board in under five minutes.'),
    moment('speed-demon', 'Speed Demon', 'Clear a 16x16 board with 40 mines in under 90 seconds.'),
    moment('blink', 'Blink and Miss It', 'Clear a 9x9 board with 10 mines in under 15 seconds.'),
    moment('crowd-work', 'Crowd Work', 'Clear a co-op board with four or more players.'),
    moment('solo-act', 'Solo Act', 'Clear a Large board on your own.'),
    moment('custom-job', 'Custom Job', "Clear a board that isn't one of the presets."),
    moment('century-of-mines', 'Century of Mines', 'Clear a board holding 100 mines or more.'),
    moment('long-haul', 'The Long Haul', 'Clear a board after more than half an hour.', { hidden: true }),
]);

/** '16x16/40' -> { rows, cols, mines }, or null. The key format is boardKeyOf's. */
const parseBoardKey = (boardKey) => {
    const match = typeof boardKey === 'string' && boardKey.match(/^(\d+)x(\d+)\/(\d+)$/);
    if (!match) return null;
    return { rows: Number(match[1]), cols: Number(match[2]), mines: Number(match[3]) };
};

/**
 * The difficulty a board's density lands on, or null below Easy.
 *
 * **Rounding is the trap here.** `mineCountFor` rounds to whole mines and can
 * round DOWN past the density it came from: Large + Hard is 320 x 0.188 =
 * 60.16 -> 60 mines -> 0.1875, which is under 0.188. A bare `density >= level`
 * files that board as Medium. So the comparison carries a half-mine tolerance,
 * and `achievements.test.js` walks every shipped size/difficulty pair back to
 * its own label.
 */
const difficultyTierOf = (boardKey) => {
    const board = parseBoardKey(boardKey);
    if (!board) return null;
    const area = board.rows * board.cols;
    if (area <= 0) return null;

    const density = board.mines / area;
    const tolerance = 0.5 / area;

    let tier = null;
    for (const level of DIFFICULTY_LEVELS) {
        if (density + tolerance >= level.density) tier = level.title;
    }
    return tier;
};

/** Whether a board is one of the shipped size/difficulty combinations. */
const isPresetBoard = (boardKey) => {
    const board = parseBoardKey(boardKey);
    if (!board) return false;
    return ALL_PRESETS.some((p) => p.rows === board.rows && p.cols === board.cols && p.mines === board.mines);
};

/** Progress toward a counter, for the shelf. Moments have none — null. */
const progressOf = (achievement, metrics) => {
    if (typeof achievement.metric !== 'string') return null;
    const value = metrics[achievement.metric] ?? 0;
    return { value: Math.min(value, achievement.threshold), threshold: achievement.threshold };
};

module.exports = {
    ACHIEVEMENTS,
    metricsFrom,
    parseBoardKey,
    difficultyTierOf,
    isPresetBoard,
    progressOf,
};
