/**
 * Tests for shared/boardConfig.js — specifically the size/difficulty split.
 *
 * Size and difficulty used to be one list of three presets. They are now two
 * axes combined by `mineCountFor`, and nothing about that combination crosses
 * the wire: the server only ever receives the resulting numbers. So this suite
 * is where the split is actually pinned down.
 *
 * The property that matters most is the first one — the three old presets are
 * still reachable on the diagonal, so the split changed no existing board.
 */

const {
    BOARD_SIZES,
    CUSTOM_SIZE,
    DIFFICULTY_LEVELS,
    DEFAULT_SIZE,
    DEFAULT_DIFFICULTY,
    DEFAULT_PRESET,
    ALL_PRESETS,
    BOARD_LIMITS,
    maxMinesFor,
    mineCountFor,
    sizePreset,
    isValidBoardConfig,
} = require('../../shared/boardConfig');

describe('mineCountFor: the pre-split presets survive on the diagonal', () => {
    // Before the split these were the only three boards you could pick. If any
    // of them moves, existing players' muscle memory (and the ui-smoke flag
    // counter assertion) breaks.
    test.each([
        ['Small / Easy was the old Easy', 9, 9, 'Easy', 10],
        ['Medium / Medium was the old Medium', 16, 16, 'Medium', 40],
        ['Large / Hard was the old Hard', 20, 16, 'Hard', 60],
    ])('%s', (_label, rows, cols, difficulty, expected) => {
        expect(mineCountFor(rows, cols, difficulty)).toBe(expected);
    });

    test('the default board is still 16x16 with 40 mines', () => {
        expect(DEFAULT_PRESET).toEqual({ rows: 16, cols: 16, mines: 40 });
    });
});

describe('mineCountFor: the full grid', () => {
    test('every size/difficulty pair produces a board the server accepts', () => {
        // ALL_PRESETS is what the UI can produce. If a size or difficulty is
        // added that the server would reject, this fails here rather than when
        // a player picks it.
        expect(ALL_PRESETS).toHaveLength(BOARD_SIZES.length * DIFFICULTY_LEVELS.length);
        for (const preset of ALL_PRESETS) {
            expect(isValidBoardConfig(preset.rows, preset.cols, preset.mines)).toBe(true);
        }
    });

    test('mines increase with difficulty at every size', () => {
        for (const size of BOARD_SIZES) {
            const counts = DIFFICULTY_LEVELS.map((l) => mineCountFor(size.rows, size.cols, l.title));
            const ascending = [...counts].sort((a, b) => a - b);
            expect(counts).toEqual(ascending);
            // And strictly so — two difficulties that round to the same count
            // would be indistinguishable to the player.
            expect(new Set(counts).size).toBe(counts.length);
        }
    });

    test('mines increase with size at every difficulty', () => {
        for (const level of DIFFICULTY_LEVELS) {
            const counts = BOARD_SIZES.map((s) => mineCountFor(s.rows, s.cols, level.title));
            expect(counts).toEqual([...counts].sort((a, b) => a - b));
        }
    });
});

describe('mineCountFor: custom dimensions', () => {
    const { MIN_ROWS, MAX_ROWS, MIN_COLS, MAX_COLS, MIN_MINES } = BOARD_LIMITS;

    test('stays valid across the whole custom range', () => {
        // Custom boards no longer carry a hand-typed mine count -- the density
        // supplies it -- so every in-range size must derive a playable board
        // for every difficulty without the caller checking anything.
        for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++) {
            for (let cols = MIN_COLS; cols <= MAX_COLS; cols++) {
                for (const level of DIFFICULTY_LEVELS) {
                    const mines = mineCountFor(rows, cols, level.title);
                    expect(isValidBoardConfig(rows, cols, mines)).toBe(true);
                }
            }
        }
    });

    test('leaves room for the 3x3 safe zone around the first click', () => {
        // generateSingleCandidateBoard caps mines at area - 9. Deriving more
        // than that would quietly produce a board with fewer mines than the
        // flag counter claims.
        for (const level of DIFFICULTY_LEVELS) {
            const mines = mineCountFor(MIN_ROWS, MIN_COLS, level.title);
            expect(mines).toBeLessThanOrEqual(MIN_ROWS * MIN_COLS - 9);
        }
    });

    test('never returns fewer than one mine', () => {
        expect(mineCountFor(MIN_ROWS, MIN_COLS, 'Easy')).toBeGreaterThanOrEqual(MIN_MINES);
    });

    test('maxMinesFor matches the validity rule exactly', () => {
        for (const area of [64, 81, 100, 256, 320, 512]) {
            expect(maxMinesFor(area)).toBeLessThan(area / 2);
            expect(maxMinesFor(area) + 1).toBeGreaterThanOrEqual(area / 2);
        }
    });
});

describe('mineCountFor: bad input', () => {
    test('an unrecognised difficulty falls back to the default density', () => {
        // A stale label in a client's store must not produce a zero-mine board.
        expect(mineCountFor(16, 16, 'Nightmare')).toBe(mineCountFor(16, 16, DEFAULT_DIFFICULTY));
        expect(mineCountFor(16, 16, undefined)).toBe(mineCountFor(16, 16, DEFAULT_DIFFICULTY));
    });

    test.each([
        ['NaN rows', NaN, 16],
        ['NaN cols', 16, NaN],
        ['undefined rows', undefined, 16],
        ['string cols', 16, '16'],
    ])('%s returns 0, which isValidBoardConfig then rejects', (_label, rows, cols) => {
        const mines = mineCountFor(rows, cols, 'Medium');
        expect(mines).toBe(0);
        expect(isValidBoardConfig(rows, cols, mines)).toBe(false);
    });
});

describe('sizePreset', () => {
    test('resolves every shipped size', () => {
        for (const size of BOARD_SIZES) {
            expect(sizePreset(size.title)).toEqual(size);
        }
    });

    test('returns null for Custom and for anything unknown', () => {
        // Landing relies on this: a null preset is what "the dialog supplies
        // the dimensions" looks like.
        expect(sizePreset(CUSTOM_SIZE)).toBeNull();
        expect(sizePreset('Enormous')).toBeNull();
    });

    test('the default size is one of the shipped sizes', () => {
        expect(sizePreset(DEFAULT_SIZE)).not.toBeNull();
    });
});
