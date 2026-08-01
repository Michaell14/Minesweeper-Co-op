/**
 * Board sizes, difficulties, limits and the validity rule — the one copy.
 *
 * Imported by BOTH halves: the client via `@/shared/boardConfig`, the server via
 * `require('../shared/boardConfig')`. Written as CommonJS so it works untouched
 * from the CJS server and from the bundler.
 *
 * This only works because Heroku deploys the whole repository. If the backend
 * ever moves back to `git subtree push --prefix server`, only `server/` would
 * ship and this import would break the deploy — see ARCHITECTURE.md §6.
 *
 * These values used to live in four places: lib/difficultyConfig, the store's
 * initial state, leaveRoom, and Landing's cancel handler — with the size rules
 * duplicated again in server/validation.js under *different* limits to the
 * client's.
 *
 * ## Size and difficulty are separate axes
 *
 * They used to be one list of three presets, so "Hard" meant both 20x16 AND 60
 * mines and you could not have a small hard board. Size now picks the
 * dimensions and difficulty picks the MINE DENSITY; `mineCountFor` combines
 * them. Only the resulting numbers cross the wire — the server never sees a
 * size or difficulty name, so this split needs no protocol change.
 *
 * The densities are chosen so the old three presets are still reachable, on the
 * diagonal: Small+Easy is 10 mines, Medium+Medium is 40, Large+Hard is 60,
 * exactly as before.
 */

/** The named board dimensions. Custom boards are bounded by BOARD_LIMITS instead. */
const BOARD_SIZES = [
    { title: 'Small', rows: 9, cols: 9 },
    { title: 'Medium', rows: 16, cols: 16 },
    { title: 'Large', rows: 20, cols: 16 },
];

/** Label used for hand-rolled dimensions. */
const CUSTOM_SIZE = 'Custom';

/**
 * The densest board the no-guess generator can actually deliver.
 *
 * Boards are generated with a no-guess guarantee, and the fallback when that
 * fails is SILENT — an unsolvable board is indistinguishable from a real one —
 * so the ceiling on difficulty is wherever the solver stops finding layouts,
 * not a matter of taste. Measured per-candidate solvable rates on a 20x16:
 * 18.8% -> 17%, 20.6% -> 7%, 22% -> 3%, 24% -> 0.3%. At `DEFAULT_MAX_ATTEMPTS`
 * (300, in server/utils/gameUtils.js) 20.6% never fell back across 200 games on
 * every shipped size; 22% still did.
 *
 * `boardConfig.test.js` holds every density to this, so raising one without
 * re-measuring fails the suite rather than quietly turning no-guess off.
 */
const MAX_SAFE_DENSITY = 0.206;

/**
 * Difficulty is a mine density, applied to whichever size is selected.
 *
 * Easy through Hard sit below classic Minesweeper's Expert (20.6%) to reduce
 * unavoidable 50/50 guesses. Extreme matches Expert exactly, which is also
 * MAX_SAFE_DENSITY — see above for why that is the ceiling.
 */
const DIFFICULTY_LEVELS = [
    { title: 'Easy', density: 0.123 },
    { title: 'Medium', density: 0.156 },
    { title: 'Hard', density: 0.188 },
    { title: 'Extreme', density: 0.206 },
];

/** What a fresh client starts on, and what leaving a room resets to. */
const DEFAULT_SIZE = 'Medium';
const DEFAULT_DIFFICULTY = 'Medium';

/** Accepted range for a custom board. The server enforces these; the client now matches. */
const BOARD_LIMITS = {
    MIN_ROWS: 8,
    MAX_ROWS: 32,
    MIN_COLS: 8,
    MAX_COLS: 16,
    MIN_MINES: 1,
};

/**
 * The most mines a board of this area can hold and still be valid.
 * Mirrors `isValidBoardConfig`'s "strictly under half" rule.
 */
const maxMinesFor = (area) => Math.ceil(area / 2) - 1;

/**
 * How many mines a size/difficulty pair works out to.
 *
 * Pure, and the single place the two axes are combined — the client computes a
 * mine count with this before emitting createRoom, and the server only ever
 * sees the number.
 *
 * An unrecognised difficulty falls back to the default density rather than
 * throwing, so a stale label in the store can never produce a zero-mine board.
 *
 * Anything that is not a whole board — a fraction, a negative, NaN, a string —
 * returns 0, which `isValidBoardConfig` then rejects. A loud failure at the
 * validation boundary beats a plausible-looking number for an impossible board:
 * two negative dimensions multiply to a positive area, so a laxer guard here
 * would have answered "4 mines" for a -5x-5 grid.
 */
const mineCountFor = (numRows, numCols, difficultyTitle) => {
    if (!Number.isInteger(numRows) || !Number.isInteger(numCols)) return 0;
    if (numRows < 1 || numCols < 1) return 0;

    const level =
        DIFFICULTY_LEVELS.find((l) => l.title === difficultyTitle) ||
        DIFFICULTY_LEVELS.find((l) => l.title === DEFAULT_DIFFICULTY);

    const area = numRows * numCols;
    const cap = maxMinesFor(area);

    // A board too small to hold even one mine legally has no valid answer, and
    // the floor below would otherwise win and return a count above the cap.
    if (cap < BOARD_LIMITS.MIN_MINES) return 0;

    // Unreachable for the shipped densities -- 20.6% is nowhere near half --
    // but keeps the function total for any density added later.
    const raw = Math.round(area * level.density);
    return Math.max(BOARD_LIMITS.MIN_MINES, Math.min(raw, cap));
};

/** Dimensions for a named size, or null for Custom / anything unknown. */
const sizePreset = (sizeTitle) => BOARD_SIZES.find((s) => s.title === sizeTitle) || null;

const DEFAULT_SIZE_PRESET = sizePreset(DEFAULT_SIZE) || BOARD_SIZES[0];

/** The board a fresh client starts on: 16x16, 40 mines, unchanged by the split. */
const DEFAULT_PRESET = {
    rows: DEFAULT_SIZE_PRESET.rows,
    cols: DEFAULT_SIZE_PRESET.cols,
    mines: mineCountFor(DEFAULT_SIZE_PRESET.rows, DEFAULT_SIZE_PRESET.cols, DEFAULT_DIFFICULTY),
};

/**
 * The one board every player gets on a given day's Daily Challenge: Medium
 * size, Extreme difficulty -- the hardest density the no-guess generator can
 * reliably deliver (MAX_SAFE_DENSITY itself). Daily generation isn't on a
 * latency-sensitive path (server/game/daily.js runs it once per day, not per
 * click), so it can afford the extra search cost this density needs, unlike
 * a regular room where Extreme is already the ceiling players can pick.
 */
const DAILY_PRESET = {
    rows: 16,
    cols: 16,
    mines: mineCountFor(16, 16, 'Extreme'),
};

/**
 * Every size/difficulty combination the UI can produce.
 *
 * Exists so `server/tests/validation.test.js` can prove the server accepts all
 * of them — adding a size or difficulty the server would reject fails there
 * rather than when a player picks it.
 */
const ALL_PRESETS = BOARD_SIZES.flatMap((size) =>
    DIFFICULTY_LEVELS.map((level) => ({
        title: `${size.title} / ${level.title}`,
        rows: size.rows,
        cols: size.cols,
        mines: mineCountFor(size.rows, size.cols, level.title),
    }))
);

/**
 * Whether a board configuration is playable.
 *
 * Mines must stay under half the board so the generator can always place them
 * outside the 3x3 safe zone around the first click.
 */
const isValidBoardConfig = (numRows, numCols, numMines) => {
    const { MIN_ROWS, MAX_ROWS, MIN_COLS, MAX_COLS, MIN_MINES } = BOARD_LIMITS;
    if (typeof numRows !== 'number' || numRows < MIN_ROWS || numRows > MAX_ROWS) return false;
    if (typeof numCols !== 'number' || numCols < MIN_COLS || numCols > MAX_COLS) return false;
    if (typeof numMines !== 'number' || numMines < MIN_MINES) return false;
    return numMines < (numRows * numCols) / 2;
};

module.exports = {
    BOARD_SIZES,
    CUSTOM_SIZE,
    DIFFICULTY_LEVELS,
    MAX_SAFE_DENSITY,
    DEFAULT_SIZE,
    DEFAULT_DIFFICULTY,
    DEFAULT_PRESET,
    DAILY_PRESET,
    ALL_PRESETS,
    BOARD_LIMITS,
    maxMinesFor,
    mineCountFor,
    sizePreset,
    isValidBoardConfig,
};
