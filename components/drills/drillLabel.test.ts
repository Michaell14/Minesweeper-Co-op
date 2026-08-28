import { describe, expect, test } from 'vitest';
import { drillCellLabel } from './drillLabel';

describe('drillCellLabel', () => {
    test('names a covered cell by its one-based position', () => {
        expect(drillCellLabel('covered', 0, 1, 0)).toBe('Unrevealed cell at row 1, column 2');
    });

    test('names a flagged cell', () => {
        expect(drillCellLabel('flagged', 2, 0, 0)).toBe('Flagged cell at row 3, column 1');
    });

    test('an opened cell announces its count, singular', () => {
        expect(drillCellLabel('open', 0, 0, 1)).toBe('Revealed cell at row 1, column 1, 1 nearby mine');
    });

    test('an opened cell announces its count, plural', () => {
        expect(drillCellLabel('open', 0, 0, 3)).toBe('Revealed cell at row 1, column 1, 3 nearby mines');
    });

    test('an opened cell touching nothing is empty, not zero', () => {
        expect(drillCellLabel('open', 1, 1, 0)).toBe('Empty cell at row 2, column 2');
    });

    test('a wrong move says so, since the mark is the only other signal', () => {
        expect(drillCellLabel('wrong', 0, 0, 0)).toBe('Wrong guess at row 1, column 1');
    });
});
