/**
 * shared/pace.js (the maths, used by both halves) and domain/pace.js (the
 * stored-field parse). Pure functions, no infra.
 *
 * The invariant that matters: milestones record WHEN progress happened, never
 * WHERE — and once stamped, an entry is immutable ("first reached"), so a
 * cascade that re-crosses nothing must change nothing.
 */

const { PACE_DECILES, safeProgress, withCrossedMilestones } = require('../../shared/pace');
const { parseMilestones } = require('../domain/pace');

/** rows x cols all-safe board with `open` cells opened row-major. */
const boardWith = (rows, cols, open, mines = 0) => {
    let toOpen = open;
    let toMine = mines;
    return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => {
            // Mines placed last so they never overlap the opened prefix.
            const cell = { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 1 };
            if (toOpen > 0) {
                toOpen--;
                cell.isOpen = true;
            } else if (toMine > 0) {
                toMine--;
                cell.isMine = true;
            }
            return cell;
        })
    );
};

describe('safeProgress', () => {
    test('counts opened safe cells against safe cells only', () => {
        // 10 cells, 2 mines -> 8 safe; 3 opened.
        expect(safeProgress(boardWith(2, 5, 3, 2))).toEqual({ opened: 3, total: 8 });
    });

    test('an all-mine board has no safe cells at all', () => {
        expect(safeProgress(boardWith(1, 2, 0, 2))).toEqual({ opened: 0, total: 0 });
    });
});

describe('withCrossedMilestones', () => {
    // 20 safe cells: each decile is exactly 2 cells, so crossings are easy to
    // stage without rounding surprises.
    const at = (open) => boardWith(4, 5, open);

    test('crossing one decile appends one stamp', () => {
        expect(withCrossedMilestones([], at(2), 1_000)).toEqual([1_000]);
    });

    test('a cascade crossing several deciles stamps them all with the same time', () => {
        expect(withCrossedMilestones([1_000], at(8), 5_000)).toEqual([1_000, 5_000, 5_000, 5_000]);
    });

    test('progress inside a decile changes nothing', () => {
        expect(withCrossedMilestones([1_000], at(3), 9_000)).toEqual([1_000]);
    });

    test('existing stamps are never rewritten -- a milestone is FIRST reached', () => {
        const out = withCrossedMilestones([1_000, 2_000], at(4), 9_000);
        expect(out).toEqual([1_000, 2_000]);
    });

    test('a fully open board fills all deciles', () => {
        expect(withCrossedMilestones([], at(20), 7_000)).toHaveLength(PACE_DECILES);
    });

    test('a board with no safe cells records nothing', () => {
        expect(withCrossedMilestones([], boardWith(1, 2, 0, 2), 1_000)).toEqual([]);
    });
});

describe('parseMilestones', () => {
    test('round-trips a stored array', () => {
        expect(parseMilestones('[0,500,1200]')).toEqual([0, 500, 1200]);
    });

    test('a pre-pace attempt (no field) reads as no milestones', () => {
        expect(parseMilestones(undefined)).toEqual([]);
        expect(parseMilestones('')).toEqual([]);
    });

    test('corrupt JSON, non-arrays and junk entries read as no milestones rather than throwing', () => {
        expect(parseMilestones('{not json')).toEqual([]);
        expect(parseMilestones('{"a":1}')).toEqual([]);
        expect(parseMilestones('[1,"fast",-5,null,2]')).toEqual([1, 2]);
    });

    test('never yields more than the decile count', () => {
        expect(parseMilestones(JSON.stringify(Array.from({ length: 15 }, (_, i) => i)))).toHaveLength(PACE_DECILES);
    });
});
