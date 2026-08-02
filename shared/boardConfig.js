/**
 * Board sizes, difficulties, limits and the validity rule — the one copy.
 *
 * Imported by BOTH halves: the client via `@/shared/boardConfig`, the server via
 * `require('../shared/boardConfig')`. CommonJS so it works untouched from the CJS
 * server and from the bundler. Viable only because the whole repo deploys — see
 * ARCHITECTURE.md §6.
 *
 * ## Size and difficulty are separate axes
 *
 * Size picks the dimensions, difficulty picks the MINE DENSITY, and
 * `mineCountFor` combines them, so a small hard board is possible. Only the
 * resulting numbers cross the wire — the server never sees either label.
 *
 * The densities keep the old three presets reachable on the diagonal:
 * Small+Easy is 10 mines, Medium+Medium is 40, Large+Hard is 60.
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
 * The no-guess fallback is SILENT — a guessy board is indistinguishable from a
 * real one — so the ceiling is wherever the solver stops finding layouts, not a
 * matter of taste. Measured per-candidate solvable rates on a 20x16: 18.8% ->
 * 17%, 20.6% -> 7%, 22% -> 3%, 24% -> 0.3%. At `DEFAULT_MAX_ATTEMPTS` (300, in
 * server/domain/boardGen.js) 20.6% never fell back across 200 games on every
 * shipped size; 22% still did.
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

/** Accepted range for a custom board, enforced on both halves. */
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
 * How many mines a size/difficulty pair works out to — pure, and the single
 * place the two axes are combined.
 *
 * An unrecognised difficulty falls back to the default density rather than
 * throwing, so a stale label can never produce a zero-mine board.
 *
 * Anything that is not a whole board — a fraction, a negative, NaN, a string —
 * returns 0, which `isValidBoardConfig` rejects. A laxer guard would answer
 * "4 mines" for a -5x-5 grid, since two negatives multiply to a positive area.
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

/** The board a fresh client starts on: 16x16, 40 mines. */
const DEFAULT_PRESET = {
    rows: DEFAULT_SIZE_PRESET.rows,
    cols: DEFAULT_SIZE_PRESET.cols,
    mines: mineCountFor(DEFAULT_SIZE_PRESET.rows, DEFAULT_SIZE_PRESET.cols, DEFAULT_DIFFICULTY),
};

/**
 * The one board every player gets each day: Medium size at Extreme difficulty,
 * which is MAX_SAFE_DENSITY itself. Generation runs once per day rather than per
 * click, so it can afford the extra search that density costs.
 */
const DAILY_PRESET = {
    rows: 16,
    cols: 16,
    mines: mineCountFor(16, 16, 'Extreme'),
};

/**
 * Every size/difficulty combination the UI can produce. Exists so
 * `server/tests/validation.test.js` can prove the server accepts all of them.
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
