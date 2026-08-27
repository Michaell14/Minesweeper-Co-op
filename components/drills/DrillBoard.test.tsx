// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DrillBoard, { initialMarks } from './DrillBoard';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn() }));

// one-two-one-a: the 1-2-1 sits on real edges, both ends covered mines.
const LAYOUT = ['121', '*#*'];

const onOpen = vi.fn();
const onFlag = vi.fn();

const renderBoard = (marks = initialMarks(LAYOUT)) =>
    render(<DrillBoard layout={LAYOUT} marks={marks} onOpen={onOpen} onFlag={onFlag} />);

beforeEach(() => vi.clearAllMocks());

describe('the drill board', () => {
    test('is one grid of rows', () => {
        renderBoard();
        expect(screen.getAllByRole('grid').length).toBe(1);
        expect(screen.getAllByRole('row').length).toBe(2);
        expect(screen.getAllByRole('gridcell').length).toBe(6);
    });

    test('the layout opens the cells the drill starts with', () => {
        renderBoard();
        expect(screen.getByRole('gridcell', { name: /row 1, column 1, 1 nearby mine$/ })).toBeTruthy();
        expect(screen.getByRole('gridcell', { name: /row 1, column 2, 2 nearby mines$/ })).toBeTruthy();
    });

    test('a covered mine is indistinguishable from a covered safe cell', () => {
        renderBoard();
        // (1,0) is a mine and (1,1) is safe; both must read the same.
        expect(screen.getByRole('gridcell', { name: 'Unrevealed cell at row 2, column 1' })).toBeTruthy();
        expect(screen.getByRole('gridcell', { name: 'Unrevealed cell at row 2, column 2' })).toBeTruthy();
    });

    test('marks render over covered cells', () => {
        const marks = initialMarks(LAYOUT);
        marks[1][0] = 'flagged';
        marks[1][2] = 'wrong';
        renderBoard(marks);
        expect(screen.getByRole('gridcell', { name: 'Flagged cell at row 2, column 1' })).toBeTruthy();
        expect(screen.getByRole('gridcell', { name: 'Wrong guess at row 2, column 3' })).toBeTruthy();
    });

    test('an opened mark shows the count derived from the layout', () => {
        const marks = initialMarks(LAYOUT);
        marks[1][1] = 'open';
        renderBoard(marks);
        // (1,1) touches both mines, and the drill never authored that number.
        expect(screen.getByRole('gridcell', { name: /row 2, column 2, 2 nearby mines$/ })).toBeTruthy();
    });

    test('a move reports the cell it happened on', () => {
        renderBoard();
        fireEvent.mouseUp(screen.getByRole('gridcell', { name: 'Unrevealed cell at row 2, column 3' }), { button: 0 });
        expect(onOpen).toHaveBeenCalledWith(1, 2);
    });
});

describe('initialMarks', () => {
    test('starts every cell covered, in the layout shape', () => {
        expect(initialMarks(LAYOUT)).toEqual([
            ['covered', 'covered', 'covered'],
            ['covered', 'covered', 'covered'],
        ]);
    });
});
