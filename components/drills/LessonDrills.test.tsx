// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LessonDrills from './LessonDrills';
import { recordSolved } from '@/lib/drillProgress';
import type { Drill } from '@/lib/drills';

vi.mock('@/lib/sound', () => ({ playSound: vi.fn() }));

const first: Drill = {
    id: 'counting-a',
    lesson: 'counting',
    prompt: 'Flag every mine you can prove.',
    layout: ['*1.', '11.', '...'],
    solution: { flag: [[0, 0]], open: [] },
    explanation: 'The 1 touches exactly one covered cell.',
};

const second: Drill = { ...first, id: 'counting-b', explanation: 'The second explanation.' };

const solveFirst = () =>
    fireEvent.contextMenu(screen.getByRole('gridcell', { name: 'Unrevealed cell at row 1, column 1' }));

beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
});

describe('working through a lesson', () => {
    test('starts on the first drill, one board at a time', () => {
        render(<LessonDrills drills={[first, second]} />);
        expect(screen.getAllByRole('grid').length).toBe(1);
        expect(screen.getByText(/Drill 1 of 2/)).toBeTruthy();
    });

    test('offers the next drill only once this one is solved', () => {
        render(<LessonDrills drills={[first, second]} />);
        expect(screen.queryByRole('button', { name: /Next drill/i })).toBeNull();
        solveFirst();
        expect(screen.getByRole('button', { name: /Next drill/i })).toBeTruthy();
    });

    test('advancing shows the next drill, fresh', () => {
        render(<LessonDrills drills={[first, second]} />);
        solveFirst();
        fireEvent.click(screen.getByRole('button', { name: /Next drill/i }));
        expect(screen.getByText(/Drill 2 of 2/)).toBeTruthy();
        expect(screen.queryByText(second.explanation)).toBeNull();
        expect(screen.getByRole('gridcell', { name: 'Unrevealed cell at row 1, column 1' })).toBeTruthy();
    });

    // The index card says "Resume" once a drill is solved. Landing back on
    // drill 1 is that promise broken, and nothing else in the app catches it.
    test('resumes at the first drill still unsolved', () => {
        recordSolved(first.id, { mistakes: 0, hints: 0 });
        render(<LessonDrills drills={[first, second]} />);
        expect(screen.getByText(/Drill 2 of 2/)).toBeTruthy();
    });

    test('starts over once every drill is solved, for a review pass', () => {
        recordSolved(first.id, { mistakes: 0, hints: 0 });
        recordSolved(second.id, { mistakes: 0, hints: 0 });
        render(<LessonDrills drills={[first, second]} />);
        expect(screen.getByText(/Drill 1 of 2/)).toBeTruthy();
    });

    test('the last drill ends the lesson instead of offering another', () => {
        render(<LessonDrills drills={[first]} />);
        solveFirst();
        expect(screen.queryByRole('button', { name: /Next drill/i })).toBeNull();
        expect(screen.getByText(/Lesson complete/i)).toBeTruthy();
    });
});
