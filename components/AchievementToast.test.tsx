// @vitest-environment jsdom
/**
 * The unlock toast. What fails silently here: a toast that never leaves (a
 * re-render re-arming its timer resets the countdown forever), and an id from
 * a newer server rendered as a raw slug.
 */
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AchievementToast from './AchievementToast';
import { useMinesweeperStore } from '@/app/store';

const push = (ids: string[]) => act(() => useMinesweeperStore.getState().pushUnlocked(ids));

beforeEach(() => {
    vi.useFakeTimers();
    useMinesweeperStore.setState({ unlockedQueue: [] });
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('the toast', () => {
    it('renders nothing while the queue is empty', () => {
        const { container } = render(<AchievementToast />);
        expect(container.firstChild).toBeNull();
    });

    it('announces an unlock by name and description', () => {
        render(<AchievementToast />);
        push(['sweeper']);
        expect(screen.getByText(/Sweeper/)).toBeTruthy();
        expect(screen.getByText('Clear 10 boards.')).toBeTruthy();
    });

    it('shows one toast per id in a multi-unlock', () => {
        render(<AchievementToast />);
        push(['sweeper', 'blink']);
        expect(screen.getByRole('status').children).toHaveLength(2);
    });

    it('dismisses itself', () => {
        render(<AchievementToast />);
        push(['sweeper']);
        act(() => { vi.advanceTimersByTime(5000); });
        expect(screen.queryByText(/Sweeper/)).toBeNull();
    });

    /*
     * The regression worth the fake timers. A second push re-renders the
     * component; if that re-armed the first toast's timer, it would never
     * expire — a permanent overlay on the board.
     */
    it('a later unlock does not restart the earlier one', () => {
        render(<AchievementToast />);
        push(['sweeper']);
        act(() => { vi.advanceTimersByTime(3000); });
        push(['blink']);
        act(() => { vi.advanceTimersByTime(2000); });

        expect(screen.queryByText(/Sweeper/)).toBeNull();
        expect(screen.getByText(/Blink and Miss It/)).toBeTruthy();
    });

    // A server one release ahead of this bundle.
    it('skips an id the catalog does not know rather than showing the slug', () => {
        render(<AchievementToast />);
        push(['not-a-real-achievement']);
        expect(screen.queryByText(/not-a-real-achievement/)).toBeNull();
        expect(screen.getByRole('status').children).toHaveLength(0);
    });

    it('announces politely and never blocks the board beneath it', () => {
        render(<AchievementToast />);
        push(['sweeper']);
        const region = screen.getByRole('status');
        expect(region.getAttribute('aria-live')).toBe('polite');
        expect(region.className).toContain('pointer-events-none');
    });
});
