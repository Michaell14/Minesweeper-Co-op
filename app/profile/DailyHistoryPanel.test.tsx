// @vitest-environment jsdom
/**
 * The daily-history calendar's silent failure modes: a day cell whose
 * accessible name stops resolving, a Next button that lets the cursor walk
 * into the future, and a stale stored streak displayed as if it were live.
 */
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import DailyHistoryPanel from './DailyHistoryPanel';

afterEach(cleanup);

const TODAY = '2026-08-08';

const HISTORY = [
    { day: '2026-07-28', won: true, durationMs: 61_000 },
    { day: '2026-08-03', won: true, durationMs: 92_500 },
    { day: '2026-08-04', won: false, durationMs: 45_000 },
];

const renderPanel = (overrides: Partial<React.ComponentProps<typeof DailyHistoryPanel>> = {}) =>
    render(
        <DailyHistoryPanel
            history={HISTORY}
            dailyCurrentStreak={2}
            dailyBestStreak={4}
            lastDailyDay="2026-08-07"
            today={TODAY}
            {...overrides}
        />,
    );

describe('the calendar grid', () => {
    it('names a cleared day with its time, formatElapsed-style (no leading zero)', () => {
        renderPanel();
        expect(screen.getByRole('listitem', { name: '2026-08-03 — cleared in 1:32' })).toBeTruthy();
    });

    it('names a failed day as attempted', () => {
        renderPanel();
        expect(screen.getByRole('listitem', { name: '2026-08-04 — attempted, not cleared' })).toBeTruthy();
    });

    it('names an unplayed past day', () => {
        renderPanel();
        expect(screen.getByRole('listitem', { name: '2026-08-01 — not played' })).toBeTruthy();
    });

    it('hides future days from the accessibility tree', () => {
        renderPanel();
        expect(screen.queryByRole('listitem', { name: /2026-08-09/ })).toBeNull();
    });

    it('opens on the current month', () => {
        renderPanel();
        expect(screen.getByRole('list', { name: 'Daily results for August 2026' })).toBeTruthy();
    });
});

describe('month navigation', () => {
    it('never walks into the future', () => {
        renderPanel();
        expect(screen.getByRole('button', { name: 'Next month' })).toHaveProperty('disabled', true);
    });

    it('walks back and renames the grid, and shows July\'s cleared day', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
        expect(screen.getByRole('list', { name: 'Daily results for July 2026' })).toBeTruthy();
        expect(screen.getByRole('listitem', { name: '2026-07-28 — cleared in 1:01' })).toBeTruthy();
    });

    it('stops at the earliest recorded month', () => {
        renderPanel();
        fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
        expect(screen.getByRole('button', { name: 'Previous month' })).toHaveProperty('disabled', true);
    });
});

describe('the streak line', () => {
    it('shows the stored streak while it is live (last clear yesterday)', () => {
        renderPanel();
        expect(screen.getByRole('status', { name: 'Daily streak' }).textContent).toContain('2');
    });

    it('shows 0 when the last clear is older than yesterday, whatever storage says', () => {
        renderPanel({ dailyCurrentStreak: 5, lastDailyDay: '2026-08-05' });
        const status = screen.getByRole('status', { name: 'Daily streak' });
        expect(status.textContent).toMatch(/streak: 0 days/);
    });
});

describe('empty history', () => {
    it('still renders the month and says where results will come from', () => {
        renderPanel({ history: [], dailyCurrentStreak: 0, dailyBestStreak: 0, lastDailyDay: null });
        expect(screen.getByRole('list', { name: 'Daily results for August 2026' })).toBeTruthy();
        expect(screen.getByText(/No dailies recorded yet/)).toBeTruthy();
        // With no history there is nothing earlier to page to.
        expect(screen.getByRole('button', { name: 'Previous month' })).toHaveProperty('disabled', true);
    });
});
