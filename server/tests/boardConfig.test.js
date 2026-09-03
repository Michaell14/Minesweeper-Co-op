/**
 * shared/boardConfig.js: the size/difficulty split. Two axes combined by
 * `mineCountFor`, and only the resulting numbers cross the wire, so this suite
 * is where the split is pinned down. The three old presets must still be
 * reachable on the diagonal.
 */

const {
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
} = require('../../shared/boardConfig');

describe('mineCountFor: the pre-split presets survive on the diagonal', () => {
    // The only three boards before the split. Moving one breaks muscle memory
    // and the ui-smoke flag counter assertion.
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

describe('DAILY_PRESET', () => {
    test('resolves through mineCountFor rather than a hand-typed mine count', () => {
        expect(DAILY_PRESET).toEqual({
            rows: 16,
            cols: 16,
            mines: mineCountFor(16, 16, 'Extreme'),
        });
    });

    test('sits at the no-guess density ceiling -- the hardest density the generator can reliably deliver', () => {
        // mineCountFor rounds to a whole mine, so 53/256 = 0.2070 lands a hair
        // above the nominal 0.206; every Extreme board at this size already
        // ships with that rounding. What matters is that it IS Extreme.
        const density = DAILY_PRESET.mines / (DAILY_PRESET.rows * DAILY_PRESET.cols);
        expect(density).toBeCloseTo(MAX_SAFE_DENSITY, 2);
        expect(DAILY_PRESET.mines).toBe(ALL_PRESETS.find((p) => p.title === 'Medium / Extreme').mines);
    });

    test('is a valid board configuration', () => {
        expect(isValidBoardConfig(DAILY_PRESET.rows, DAILY_PRESET.cols, DAILY_PRESET.mines)).toBe(true);
    });
});

describe('the no-guess density ceiling', () => {
    /*
     * generateBoard falls back to a guessy board SILENTLY when it cannot find
     * a solvable layout. Raising a density is a one-character change; without
     * this test nothing would fail.
     */
    test('no difficulty exceeds the measured ceiling', () => {
        for (const level of DIFFICULTY_LEVELS) {
            expect(level.density).toBeLessThanOrEqual(MAX_SAFE_DENSITY);
        }
    });

    test('the ceiling itself has not been raised without re-measuring', () => {
        // Changing this changes what "no-guess" means; re-measure first (ARCHITECTURE.md §5).
        expect(MAX_SAFE_DENSITY).toBe(0.206);
    });

    test('densities are distinct and ordered', () => {
        const densities = DIFFICULTY_LEVELS.map((l) => l.density);
        expect(densities).toEqual([...densities].sort((a, b) => a - b));
        expect(new Set(densities).size).toBe(densities.length);
    });
});

describe('mineCountFor: the full grid', () => {
    test('every size/difficulty pair produces a board the server accepts', () => {
        // ALL_PRESETS is what the UI can produce; a size the server would reject fails here, not on pick.
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
            // Strictly: two difficulties rounding to the same count would be indistinguishable.
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
        // The density supplies the mine count, so every in-range size must derive a playable board.
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
        // generateSingleCandidateBoard caps mines at area - 9; more would undercut the flag counter.
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
        ['fractional rows', 16.5, 16],
        ['zero rows', 0, 16],
        ['zero cols', 16, 0],
        // Two negatives multiply to a positive area; a finite-number guard answered "4 mines".
        ['both negative', -5, -5],
        ['one negative', -5, 16],
    ])('%s returns 0, which isValidBoardConfig then rejects', (_label, rows, cols) => {
        const mines = mineCountFor(rows, cols, 'Medium');
        expect(mines).toBe(0);
        expect(isValidBoardConfig(rows, cols, mines)).toBe(false);
    });

    test('a board too small to hold a legal mine returns 0, not the floor', () => {
        // maxMinesFor(1) is 0, so MIN_MINES must NOT win: 1 would exceed the board's legal maximum.
        expect(mineCountFor(1, 1, 'Medium')).toBe(0);
        expect(mineCountFor(1, 2, 'Extreme')).toBe(0);
    });

    test('never returns more mines than the board can legally hold', () => {
        // Every shape the limits allow plus the degenerate sizes below, since this runs before validation.
        for (let rows = 1; rows <= BOARD_LIMITS.MAX_ROWS; rows++) {
            for (let cols = 1; cols <= BOARD_LIMITS.MAX_COLS; cols++) {
                for (const level of DIFFICULTY_LEVELS) {
                    const mines = mineCountFor(rows, cols, level.title);
                    if (mines === 0) continue;
                    expect(mines).toBeLessThanOrEqual(maxMinesFor(rows * cols));
                    expect(mines).toBeGreaterThanOrEqual(BOARD_LIMITS.MIN_MINES);
                }
            }
        }
    });
});

describe('sizePreset', () => {
    test('resolves every shipped size', () => {
        for (const size of BOARD_SIZES) {
            expect(sizePreset(size.title)).toEqual(size);
        }
    });

    test('returns null for Custom and for anything unknown', () => {
        // Landing relies on this: a null preset means the dialog supplies the dimensions.
        expect(sizePreset(CUSTOM_SIZE)).toBeNull();
        expect(sizePreset('Enormous')).toBeNull();
    });

    test('the default size is one of the shipped sizes', () => {
        expect(sizePreset(DEFAULT_SIZE)).not.toBeNull();
    });
});
