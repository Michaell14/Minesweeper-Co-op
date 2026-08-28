// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DrillRunner from './DrillRunner';
import type { Drill } from '@/lib/drills';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn() }));

// one-two-one-a, verified in the spec: mine-safe-mine under 1-2-1.
const DRILL: Drill = {
    id: 'one-two-one-a',
    lesson: 'one-two-one',
    prompt: 'Flag every mine and open every safe cell you can prove.',
    layout: ['121', '*#*'],
    solution: { flag: [[1, 0], [1, 2]], open: [[1, 1]] },
    explanation: 'Only mine-safe-mine satisfies all three.',
};

const cellNamed = (name: string | RegExp) => screen.getByRole('gridcell', { name });
const flag = (name: string) => fireEvent.contextMenu(cellNamed(name));
const open = (name: string) => fireEvent.mouseUp(cellNamed(name), { button: 0 });

const solveIt = () => {
    flag('Unrevealed cell at row 2, column 1');
    flag('Unrevealed cell at row 2, column 3');
    open('Unrevealed cell at row 2, column 2');
};

beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
});

describe('a correct move', () => {
    test('flagging a mine marks it flagged', () => {
        render(<DrillRunner drill={DRILL} />);
        flag('Unrevealed cell at row 2, column 1');
        expect(cellNamed('Flagged cell at row 2, column 1')).toBeTruthy();
    });

    test('opening a safe cell reveals the count derived from the layout', () => {
        render(<DrillRunner drill={DRILL} />);
        open('Unrevealed cell at row 2, column 2');
        expect(cellNamed(/row 2, column 2, 2 nearby mines$/)).toBeTruthy();
    });
});

describe('a wrong move', () => {
    test('marks the cell without ending the drill', () => {
        render(<DrillRunner drill={DRILL} />);
        open('Unrevealed cell at row 2, column 1');
        expect(cellNamed('Wrong guess at row 2, column 1')).toBeTruthy();
        expect(screen.queryByText(DRILL.explanation)).toBeNull();
    });

    test('is counted', () => {
        render(<DrillRunner drill={DRILL} />);
        open('Unrevealed cell at row 2, column 1');
        expect(screen.getByText(/1 mistake/i)).toBeTruthy();
    });

    test('clears on the next click, so the cell can be retried', () => {
        render(<DrillRunner drill={DRILL} />);
        open('Unrevealed cell at row 2, column 1');
        open('Wrong guess at row 2, column 1');
        expect(cellNamed('Unrevealed cell at row 2, column 1')).toBeTruthy();
    });
});

describe('solving', () => {
    test('the explanation appears once the solution is complete', () => {
        render(<DrillRunner drill={DRILL} />);
        expect(screen.queryByText(DRILL.explanation)).toBeNull();
        solveIt();
        expect(screen.getByText(DRILL.explanation)).toBeTruthy();
    });

    test('a partly correct board is not solved', () => {
        render(<DrillRunner drill={DRILL} />);
        flag('Unrevealed cell at row 2, column 1');
        flag('Unrevealed cell at row 2, column 3');
        expect(screen.queryByText(DRILL.explanation)).toBeNull();
    });

    test('a clean solve is stored as perfect', () => {
        render(<DrillRunner drill={DRILL} />);
        solveIt();
        expect(JSON.parse(window.localStorage.getItem('ms-drills') ?? '{}')).toEqual({
            version: 1,
            completed: ['one-two-one-a'],
            perfect: ['one-two-one-a'],
        });
    });

    test('a solve after a mistake is completed but not perfect', () => {
        render(<DrillRunner drill={DRILL} />);
        open('Unrevealed cell at row 2, column 1');
        open('Wrong guess at row 2, column 1');
        solveIt();
        const stored = JSON.parse(window.localStorage.getItem('ms-drills') ?? '{}');
        expect(stored.completed).toEqual(['one-two-one-a']);
        expect(stored.perfect).toEqual([]);
    });

    test('a solved drill takes no further moves', () => {
        render(<DrillRunner drill={DRILL} />);
        solveIt();
        flag('Flagged cell at row 2, column 1');
        expect(cellNamed('Flagged cell at row 2, column 1')).toBeTruthy();
    });
});

describe('the prompt', () => {
    test('is shown before the drill is solved', () => {
        render(<DrillRunner drill={DRILL} />);
        expect(screen.getByText(DRILL.prompt)).toBeTruthy();
    });
});

const explanation = () => screen.queryByRole('status', { name: 'Explanation' });

describe('when a move is wrong', () => {
    test('nothing is explained before the player has done anything', () => {
        render(<DrillRunner drill={DRILL} />);
        expect(explanation()).toBeNull();
    });

    test('the drill says why the cell is what it is', () => {
        render(<DrillRunner drill={DRILL} />);
        open('Unrevealed cell at row 2, column 1');
        expect(explanation()?.textContent).toMatch(/mine/i);
    });

    test('the reason comes from the rules, naming a number on the board', () => {
        render(<DrillRunner drill={DRILL} />);
        open('Unrevealed cell at row 2, column 1');
        expect(explanation()?.textContent).toMatch(/row 1, column \d/);
    });

    test('acting again clears the explanation', () => {
        render(<DrillRunner drill={DRILL} />);
        open('Unrevealed cell at row 2, column 1');
        open('Wrong guess at row 2, column 1');
        expect(explanation()).toBeNull();
    });
});

describe('hints', () => {
    test('a hint points at a cell and names the reason', () => {
        render(<DrillRunner drill={DRILL} />);
        fireEvent.click(screen.getByRole('button', { name: /Hint/i }));
        const text = explanation()?.textContent ?? '';
        expect(text).toMatch(/row 2, column 3/);
        expect(text).toMatch(/mine/i);
    });

    test('a hint does not play the move for you', () => {
        render(<DrillRunner drill={DRILL} />);
        fireEvent.click(screen.getByRole('button', { name: /Hint/i }));
        expect(cellNamed('Unrevealed cell at row 2, column 3')).toBeTruthy();
    });

    test('a hinted solve is completed but not perfect', () => {
        render(<DrillRunner drill={DRILL} />);
        fireEvent.click(screen.getByRole('button', { name: /Hint/i }));
        solveIt();
        const stored = JSON.parse(window.localStorage.getItem('ms-drills') ?? '{}');
        expect(stored.completed).toEqual(['one-two-one-a']);
        expect(stored.perfect).toEqual([]);
    });

    test('a solved drill offers no more hints', () => {
        render(<DrillRunner drill={DRILL} />);
        solveIt();
        expect(screen.queryByRole('button', { name: /Hint/i })).toBeNull();
    });
});
