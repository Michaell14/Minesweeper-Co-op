import { describe, expect, test } from 'vitest';
import type { Cell } from '@/shared/socketPayloads';
import { positionToLayout, classifyLesson, diagnoseLoss, shortLessonName } from './lossDiagnosis';
import type { Explanation } from './drillDeduction';
import type { Coord } from './drills';

const open = (nearbyMines: number): Cell => ({ isMine: false, isOpen: true, isFlagged: false, nearbyMines });
/* preLoss never carries mine truth: projectCell zeroes it for closed cells. */
const covered = (isFlagged = false): Cell =>
    ({ isMine: false, isOpen: false, isFlagged, nearbyMines: 0 });
const truth = (isMine: boolean): Cell => ({ isMine, isOpen: false, isFlagged: false, nearbyMines: 0 });

describe('turning a live position into a drill layout', () => {
    test('opened cells become their digit, and zero becomes a dot', () => {
        const preLoss = [[open(0), open(1), open(2)]];
        const revealed = [[truth(false), truth(false), truth(false)]];

        expect(positionToLayout(preLoss, revealed)).toEqual(['.12']);
    });

    test('covered cells take their mine truth from the revealed board', () => {
        const preLoss = [[covered(), covered()]];
        const revealed = [[truth(true), truth(false)]];

        expect(positionToLayout(preLoss, revealed)).toEqual(['*#']);
    });

    /* deduce() re-derives everything from opened numbers, so a flag the player
       got wrong must not reach it and make the diagnosis lie. */
    test('a flag on a safe cell is ignored, not treated as a mine', () => {
        const preLoss = [[covered(true)]];
        const revealed = [[truth(false)]];

        expect(positionToLayout(preLoss, revealed)).toEqual(['#']);
    });
});

const why = (
    rule: 'counting' | 'subset',
    verdict: 'mine' | 'safe',
    clues: Coord[],
): Explanation => ({ rule, verdict, clues, text: '' });

describe('naming the pattern behind a deduction', () => {
    test('a counting step is the counting lesson, whatever is around it', () => {
        expect(classifyLesson(['1221', '####'], why('counting', 'mine', [[0, 1]]))).toBe('counting');
    });

    test('reads 1-2-2-1 along a row', () => {
        expect(classifyLesson(['1221', '####'], why('subset', 'mine', [[0, 0], [0, 1]])))
            .toBe('one-two-two-one');
    });

    test('reads 1-2-1 along a row', () => {
        expect(classifyLesson(['121', '###'], why('subset', 'mine', [[0, 0], [0, 1]])))
            .toBe('one-two-one');
    });

    test('reads 1-2-1 down a column', () => {
        expect(classifyLesson(['1#', '2#', '1#'], why('subset', 'mine', [[0, 0], [1, 0]])))
            .toBe('one-two-one');
    });

    test('reads a plain 1-2', () => {
        expect(classifyLesson(['12.', '###'], why('subset', 'mine', [[0, 0], [0, 1]])))
            .toBe('one-two');
    });

    test('reads a plain 1-1', () => {
        expect(classifyLesson(['11.', '###'], why('subset', 'safe', [[0, 0], [0, 1]])))
            .toBe('one-one');
    });

    /* The match has to cover the cells that actually fired, or a shape
       elsewhere in the same row names a pattern that had nothing to do with
       it. Here "112" contains "12", but not over the clues. */
    test('ignores a shape that does not span the clue cells', () => {
        expect(classifyLesson(['112', '###'], why('subset', 'safe', [[0, 0], [0, 1]])))
            .toBe('one-one');
    });

    test('reads a reflected 1-2 as a 1-2', () => {
        expect(classifyLesson(['.21', '###'], why('subset', 'mine', [[0, 1], [0, 2]])))
            .toBe('one-two');
    });

    /* 1-1 proves cells safe and 1-2 proves a mine. A two-digit run whose
       verdict disagrees is some other reduction wearing the same digits. */
    test('will not call it a 1-1 when it proved a mine', () => {
        expect(classifyLesson(['11.', '###'], why('subset', 'mine', [[0, 0], [0, 1]])))
            .toBe('reduction');
    });

    test('falls back to reduction when the clues are not on one line', () => {
        expect(classifyLesson(['12', '21'], why('subset', 'mine', [[0, 0], [1, 1]])))
            .toBe('reduction');
    });
});

/* Cells as the two boards hold them: `preLoss` is the client's own position
   before the fatal move, `revealed` is the payload with every mine in it. */
const pre = (isOpen: boolean, nearbyMines = 0): Cell =>
    ({ isMine: false, isOpen, isFlagged: false, nearbyMines });
const post = (isMine: boolean, isOpen: boolean, nearbyMines = 0): Cell =>
    ({ isMine, isOpen, isFlagged: false, nearbyMines });

describe('diagnosing a loss', () => {
    /*
     * A 1 with exactly one covered neighbour, which the player opened. The
     * mine was provable by counting.
     *   1 #        the # at (0,1) is the only cell the 1 can be counting
     *   . .
     */
    test('reports the mine you opened when it was provable', () => {
        const preLoss = [[pre(true, 1), pre(false)], [pre(true, 1), pre(true, 1)]];
        const revealed = [[post(false, true, 1), post(true, true)], [post(false, true, 1), post(false, true, 1)]];

        const result = diagnoseLoss(preLoss, revealed);

        expect(result?.kind).toBe('provable-mine');
        expect(result?.target).toEqual([0, 1]);
        expect(result?.verdict).toBe('mine');
        expect(result?.lesson).toBe('counting');
        expect(result?.text.length).toBeGreaterThan(0);
    });

    /*
     * The mine at (0,0) is genuinely undetermined — the two 1s below it both
     * see exactly {(0,0), (0,1)} and want one mine, so neither cell can be
     * separated from the other. Meanwhile the 0 at (0,3) proves three cells
     * safe. The player opened (0,0) with that move still on the table.
     *
     * As a layout:  *##.#
     *               11#..
     *               .....
     */
    test('points at a move that was certain when the one you took was not', () => {
        const preLoss = [
            [pre(false), pre(false), pre(false), pre(true, 0), pre(false)],
            [pre(true, 1), pre(true, 1), pre(false), pre(true, 0), pre(true, 0)],
            [pre(true, 0), pre(true, 0), pre(true, 0), pre(true, 0), pre(true, 0)],
        ];
        const revealed = [
            [post(true, true), post(false, false), post(false, false), post(false, true, 0), post(false, false)],
            [post(false, true, 1), post(false, true, 1), post(false, false), post(false, true, 0), post(false, true, 0)],
            [post(false, true, 0), post(false, true, 0), post(false, true, 0), post(false, true, 0), post(false, true, 0)],
        ];

        const result = diagnoseLoss(preLoss, revealed);

        expect(result?.kind).toBe('guess');
        expect(result?.verdict).toBe('safe');
        expect(result?.lesson).toBe('counting');
        // The 0 at (0,3) is scanned first and reaches (0,2) first.
        expect(result?.target).toEqual([0, 2]);
    });

    /*
     * Same ambiguous mine and counting step as the test above, with a
     * self-contained 1-2-1 ("1211" over "*#*#") stacked below it. Counting is
     * still the FIRST thing `nextHint` would reach on its own — the blank at
     * (0,3) proves (0,2) safe before the subset step below ever runs — but a
     * named pattern is available elsewhere on the board, and that is the one
     * worth teaching.
     */
    test('prefers a named pattern elsewhere over a counting step, for Case B', () => {
        const preLoss = [
            [pre(false), pre(false), pre(false), pre(true, 0)],
            [pre(true, 1), pre(true, 1), pre(false), pre(true, 0)],
            [pre(true, 0), pre(true, 0), pre(true, 0), pre(true, 0)],
            [pre(true, 1), pre(true, 2), pre(true, 1), pre(true, 1)],
            [pre(false), pre(false), pre(false), pre(false)],
        ];
        const revealed = [
            [post(true, true), post(false, false), post(false, false), post(false, true, 0)],
            [post(false, true, 1), post(false, true, 1), post(false, false), post(false, true, 0)],
            [post(false, true, 0), post(false, true, 0), post(false, true, 0), post(false, true, 0)],
            [post(false, true, 1), post(false, true, 2), post(false, true, 1), post(false, true, 1)],
            [post(true, false), post(false, false), post(true, false), post(false, false)],
        ];

        const result = diagnoseLoss(preLoss, revealed);

        expect(result?.kind).toBe('guess');
        expect(result?.lesson).toBe('one-two-one');
        expect(result?.target).toEqual([4, 2]);
    });

    /* Nothing opened means nothing proves anything. It must go quiet rather
       than claim something false. */
    test('returns null when nothing at all was provable', () => {
        const preLoss = [[pre(false), pre(false)]];
        const revealed = [[post(true, true), post(false, false)]];

        expect(diagnoseLoss(preLoss, revealed)).toBeNull();
    });
});

describe('how a lesson is said out loud', () => {
    test('names the shapes the way a player would', () => {
        expect(shortLessonName('one-two-one')).toBe('a 1-2-1');
        expect(shortLessonName('one-two-two-one')).toBe('a 1-2-2-1');
        expect(shortLessonName('counting')).toBe('a counting step');
        expect(shortLessonName('reduction')).toBe('a subset reduction');
    });
});
