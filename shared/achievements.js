/**
 * The achievement catalog, imported by both halves (CommonJS, see
 * ARCHITECTURE.md §6). Declarative so the client can draw LOCKED progress: a
 * `counter` carries its metric and threshold as data, and both halves read the
 * same two fields. A `moment` is a predicate over one finished game, kept
 * server-side in `server/domain/achievements.js` keyed by id;
 * `achievements.test.js` fails if the sets disagree. Frozen like
 * `shared/events.js`, so TypeScript infers the literal ids.
 */

const { ALL_PRESETS, DIFFICULTY_LEVELS } = require('./boardConfig');
const { boardPartOf } = require('./boardKeys');

/**
 * Every metric a `counter` may name, from a stats snapshot (the `getProfile`
 * shape, also what the server assembles mid-transaction). The keys ARE the
 * metric list. Streaks are the best, never the current: a lapse must not
 * revoke a badge.
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

/* Both kinds carry the same keys, so the client reads one type instead of a union. */
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
 * The catalog, in display order. Counters are retroactive (the evaluator reads
 * a snapshot, not a delta); moments are not, since they describe one game.
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

/**
 * '16x16/40' -> { rows, cols, mines }, or null (boardKeyOf's format). The group
 * suffix ('@3') is dropped, not rejected: every predicate asks about the board.
 */
const parseBoardKey = (boardKey) => {
    if (typeof boardKey !== 'string') return null;
    const match = boardPartOf(boardKey).match(/^(\d+)x(\d+)\/(\d+)$/);
    if (!match) return null;
    return { rows: Number(match[1]), cols: Number(match[2]), mines: Number(match[3]) };
};

/**
 * The difficulty a board's density lands on, or null below Easy. `mineCountFor`
 * rounds to whole mines and can land under the density it came from (Large +
 * Hard: 60 mines is 0.1875 < 0.188), so the comparison carries a half-mine
 * tolerance; `achievements.test.js` walks every preset back to its label.
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

/** Progress toward a counter; null for a moment. */
const progressOf = (achievement, metrics) => {
    if (typeof achievement.metric !== 'string') return null;
    const value = metrics[achievement.metric] ?? 0;
    return { value: Math.min(value, achievement.threshold), threshold: achievement.threshold };
};

/**
 * Qualified, but the award has not landed: lowering a threshold puts existing
 * qualifiers here until their next game. Shared by the shelf and the avatar
 * picker so both explain the state the same way. Says nothing about whether
 * it is already earned; callers know that.
 *
 * @param {{ metric: string | null, threshold: number | null }} achievement
 * @param {Record<string, number>} metrics
 * @returns {boolean}
 */
const isPending = (achievement, metrics) => {
    const progress = progressOf(achievement, metrics);
    return !!progress && progress.value >= progress.threshold;
};

/** The wording both surfaces use for that state. */
const PENDING_NOTE = 'Lands when you next finish a game.';

module.exports = {
    ACHIEVEMENTS,
    isPending,
    PENDING_NOTE,
    metricsFrom,
    parseBoardKey,
    difficultyTierOf,
    isPresetBoard,
    progressOf,
};
