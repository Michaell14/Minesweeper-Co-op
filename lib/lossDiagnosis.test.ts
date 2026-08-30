import { describe, expect, test } from 'vitest';
import type { Cell } from '@/shared/socketPayloads';
import { positionToLayout, classifyLesson } from './lossDiagnosis';
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
