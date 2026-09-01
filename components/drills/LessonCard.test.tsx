// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import LessonCard from './LessonCard';
import { recordSolved } from '@/lib/drillProgress';
import type { Lesson } from '@/lib/drills';

const LESSON: Lesson = {
    id: 'counting',
    title: 'Counting',
    blurb: 'A number equal to its covered neighbours means all mines.',
    intro: 'Every number counts the mines touching it. Two things follow.',
};

beforeEach(() => window.localStorage.clear());

describe('a lesson card', () => {
    test('links to its lesson by name', () => {
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={['counting-a', 'counting-b']} />);
        expect(screen.getByRole('link', { name: /Counting/ }).getAttribute('href')).toBe('/drills/counting');
    });

    test('says what the lesson teaches', () => {
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={['counting-a']} />);
        expect(screen.getByText(LESSON.blurb)).toBeTruthy();
    });

    test('counts nothing solved for a fresh browser', () => {
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={['counting-a', 'counting-b']} />);
        expect(screen.getByText('0 of 2 solved')).toBeTruthy();
    });

    test('counts only this lesson’s drills', () => {
        recordSolved('counting-a', { mistakes: 0, hints: 0 });
        recordSolved('one-two-one-a', { mistakes: 0, hints: 0 });
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={['counting-a', 'counting-b']} />);
        expect(screen.getByText('1 of 2 solved')).toBeTruthy();
    });

    test('marks a finished lesson', () => {
        recordSolved('counting-a', { mistakes: 0, hints: 0 });
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={['counting-a']} />);
        expect(screen.getByText(/Complete/i)).toBeTruthy();
    });

    // The verb is the only thing on the card that says clicking it does
    // something, and it is the one the /drills index was redesigned around.
    test('says to start a lesson not begun', () => {
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={['counting-a', 'counting-b']} />);
        expect(screen.getByText('Start')).toBeTruthy();
    });

    test('says to resume one part-finished', () => {
        recordSolved('counting-a', { mistakes: 0, hints: 0 });
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={['counting-a', 'counting-b']} />);
        expect(screen.getByText('Resume')).toBeTruthy();
    });

    test('says to review one already finished', () => {
        recordSolved('counting-a', { mistakes: 0, hints: 0 });
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={['counting-a']} />);
        expect(screen.getByText('Review')).toBeTruthy();
    });

    test('shows its place in the ladder', () => {
        render(<LessonCard lesson={LESSON} ordinal={4} drillIds={['counting-a']} />);
        expect(screen.getByText('4')).toBeTruthy();
    });
});

describe('a lesson with nothing written yet', () => {
    test('says so instead of counting zero out of zero', () => {
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={[]} />);
        expect(screen.getByText(/Coming soon/i)).toBeTruthy();
        expect(screen.queryByText('0 of 0 solved')).toBeNull();
    });

    test('is not a link, since there is nothing behind it yet', () => {
        render(<LessonCard lesson={LESSON} ordinal={1} drillIds={[]} />);
        expect(screen.queryByRole('link')).toBeNull();
    });
});
