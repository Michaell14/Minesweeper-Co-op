/**
 * Board sizes, difficulties, limits and the validity rule. Imported by BOTH
 * halves, hence CommonJS (see ARCHITECTURE.md §6). Size picks the dimensions,
 * difficulty picks the MINE DENSITY, `mineCountFor` combines them, and only
 * the resulting numbers cross the wire. The densities keep the old presets on
 * the diagonal: Small+Easy is 10 mines, Medium+Medium 40, Large+Hard 60.
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
 * The densest board the no-guess generator can deliver. The fallback to a
 * guessy board is SILENT, so this is measured, not taste: solvable rate per
 * candidate on 20x16 was 18.8% -> 17%, 20.6% -> 7%, 22% -> 3%, 24% -> 0.3%,
 * and at `DEFAULT_MAX_ATTEMPTS` (300, server/domain/boardGen.js) 20.6% never
 * fell back across 200 games per shipped size while 22% did.
 * `boardConfig.test.js` holds every density to it.
 */
const MAX_SAFE_DENSITY = 0.206;

/**
 * Difficulty is a mine density. Easy through Hard sit below classic Expert
 * (20.6%) to reduce forced guesses; Extreme is Expert, which is MAX_SAFE_DENSITY.
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

/** Most mines a board of this area can hold; mirrors `isValidBoardConfig`'s "under half" rule. */
const maxMinesFor = (area) => Math.ceil(area / 2) - 1;

/**
 * Mines for a size/difficulty pair; the one place the axes combine. An unknown
 * difficulty falls back to the default density so a stale label cannot give a
 * zero-mine board. Anything not a whole board returns 0, which
 * `isValidBoardConfig` rejects; two negatives would otherwise multiply to a positive area.
 */
const mineCountFor = (numRows, numCols, difficultyTitle) => {
    if (!Number.isInteger(numRows) || !Number.isInteger(numCols)) return 0;
    if (numRows < 1 || numCols < 1) return 0;

    const level =
        DIFFICULTY_LEVELS.find((l) => l.title === difficultyTitle) ||
        DIFFICULTY_LEVELS.find((l) => l.title === DEFAULT_DIFFICULTY);

    const area = numRows * numCols;
    const cap = maxMinesFor(area);

    // Too small for one legal mine: the floor below would otherwise return a count above the cap.
    if (cap < BOARD_LIMITS.MIN_MINES) return 0;

    // Unreachable at shipped densities, but keeps the function total.
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

/** The daily board: Medium at Extreme (MAX_SAFE_DENSITY). Generated once a day, so it can afford the search. */
const DAILY_PRESET = {
    rows: 16,
    cols: 16,
    mines: mineCountFor(16, 16, 'Extreme'),
};

/** Every size/difficulty combination the UI can produce; `server/tests/validation.test.js` checks each. */
const ALL_PRESETS = BOARD_SIZES.flatMap((size) =>
    DIFFICULTY_LEVELS.map((level) => ({
        title: `${size.title} / ${level.title}`,
        rows: size.rows,
        cols: size.cols,
        mines: mineCountFor(size.rows, size.cols, level.title),
    }))
);

/** Playable? Mines stay under half the board so the 3x3 first-click safe zone always fits. */
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
