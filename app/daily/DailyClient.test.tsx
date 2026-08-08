// @vitest-environment jsdom

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DailyClient from './DailyClient';
import { useMinesweeperStore } from '@/app/store';

/**
 * The socket is the whole point of `useGameSession`, and none of it is what
 * this file is about: these tests are here because the intro must NOT start an
 * attempt, and because the button that does start one has to keep resolving by
 * name. Both fail silently — a page that quietly burns the visitor's one attempt
 * for the day looks exactly like a page that does not.
 */
const startDaily = vi.fn();
const leaveDaily = vi.fn();
const push = vi.fn();

// jsdom has no app-router context, so useRouter throws on sight.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/hooks/useGameSession', () => ({
    useGameSession: () => ({
        socket: null,
        actions: new Proxy({ startDaily, leaveDaily }, {
            get: (target: Record<string, unknown>, key: string) => target[key] ?? (() => {}),
        }),
    }),
}));

const intro = <h1>Minesweeper Daily Challenge</h1>;

const playButton = () => screen.queryByRole('link', { name: /daily challenge/i })
    ?? screen.queryByRole('button', { name: /daily challenge/i });

beforeEach(() => {
    startDaily.mockClear();
    leaveDaily.mockClear();
    push.mockClear();
    act(() => {
        useMinesweeperStore.getState().setDailyActive(false);
    });
});

describe('/daily before the player opts in', () => {
    test('renders the intro rather than a board', () => {
        render(<DailyClient intro={intro} />);

        expect(screen.getByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeTruthy();
    });

    test('does NOT start an attempt on mount', () => {
        render(<DailyClient intro={intro} />);

        // Arriving from a search result must not consume the one attempt of the
        // day before the visitor has decided to play.
        expect(startDaily).not.toHaveBeenCalled();
    });

    test('the play button starts the attempt', () => {
        render(<DailyClient intro={intro} />);

        const button = playButton();
        expect(button).toBeTruthy();

        fireEvent.click(button!);
        expect(startDaily).toHaveBeenCalledTimes(1);
    });
});

describe('/daily once the attempt is active', () => {
    test('swaps the intro for the board', () => {
        render(<DailyClient intro={intro} />);

        act(() => {
            useMinesweeperStore.getState().setDailyActive(true);
        });

        expect(screen.queryByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeNull();
    });

    /*
     * The button says "Return to Home", and on its own route clearing
     * `dailyActive` alone lands on this page's intro instead — a control that
     * quietly stopped doing what it says. Clearing still has to happen too: a
     * clock left running gets recorded as a run the browser played.
     */
    test('leaving clears daily state AND goes home, as the button promises', () => {
        render(<DailyClient intro={intro} />);
        act(() => {
            useMinesweeperStore.getState().setDailyActive(true);
        });

        fireEvent.click(screen.getByRole('button', {
            name: 'Leave daily challenge and return to home page',
        }));

        expect(leaveDaily).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith('/');
    });
});
