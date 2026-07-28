/**
 * Board presets, limits and the validity rule — the one copy.
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
 */

/**
 * Mine density is kept below classic Minesweeper's (Expert is 20.6%) to reduce
 * unavoidable 50/50 guesses.
 *   Easy   12.3%  (10 / 81)
 *   Medium 15.6%  (40 / 256)
 *   Hard   18.8%  (60 / 320)
 */
const DIFFICULTY_PRESETS = [
    { title: 'Easy', rows: 9, cols: 9, mines: 10 },
    { title: 'Medium', rows: 16, cols: 16, mines: 40 },
    { title: 'Hard', rows: 20, cols: 16, mines: 60 },
];

/** Label used for a hand-rolled board. */
const CUSTOM_DIFFICULTY = 'Custom';

/** What a fresh client starts on, and what leaving a room resets to. */
const DEFAULT_DIFFICULTY = 'Medium';

const DEFAULT_PRESET =
    DIFFICULTY_PRESETS.find((preset) => preset.title === DEFAULT_DIFFICULTY) || DIFFICULTY_PRESETS[0];

/** Accepted range for a custom board. The server enforces these; the client now matches. */
const BOARD_LIMITS = {
    MIN_ROWS: 8,
    MAX_ROWS: 32,
    MIN_COLS: 8,
    MAX_COLS: 16,
    MIN_MINES: 1,
};

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
    DIFFICULTY_PRESETS,
    CUSTOM_DIFFICULTY,
    DEFAULT_DIFFICULTY,
    DEFAULT_PRESET,
    BOARD_LIMITS,
    isValidBoardConfig,
};
