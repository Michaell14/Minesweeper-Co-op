import { describe, expect, test } from 'vitest';
import type { Cell } from '@/shared/socketPayloads';
import { positionToLayout } from './lossDiagnosis';

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
