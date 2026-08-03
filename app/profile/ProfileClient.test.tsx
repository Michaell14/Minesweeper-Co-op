// @vitest-environment jsdom
/**
 * The profile page's states by accessible name: signed out, unavailable, and
 * the populated dashboard — plus the guest import appearing only when this
 * browser actually holds local bests.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
}));

const mockFetchStats = vi.fn();
const mockImportBests = vi.fn();
vi.mock('@/lib/statsApi', () => ({
    fetchStats: (...args: unknown[]) => mockFetchStats(...args),
    importBests: (...args: unknown[]) => mockImportBests(...args),
}));

import ProfileClient from './ProfileClient';
import { clearBestTimes, recordBestTime, boardKey } from '@/lib/bestTimes';

const PAYLOAD = {
    stats: {
        coopGames: 10, coopWins: 6,
        pvpGames: 4, pvpWins: 3,
        dailyGames: 2, dailyWins: 1,
        currentStreak: 3, bestStreak: 7,
        lastPlayedDay: '2026-08-02',
    },
    boardBests: [
        { boardKey: '16x16/40', seconds: 92, players: 1, achievedAt: '2026-08-01T12:00:00Z' },
    ],
    recentGames: [
        { mode: 'co-op', boardKey: '16x16/40', won: true, durationMs: 92500, players: 3, finishedAt: '2026-08-02T10:00:00Z' },
        { mode: 'daily', boardKey: '14x14/32', won: false, durationMs: 30000, players: 1, finishedAt: '2026-08-01T09:00:00Z' },
    ],
};

beforeEach(() => {
    localStorage.clear();
    mockUseSession.mockReset();
    mockFetchStats.mockReset();
    mockImportBests.mockReset();
});

afterEach(cleanup);

describe('signed out', () => {
    it('invites sign-in instead of showing an empty dashboard', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<ProfileClient />);
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
        expect(mockFetchStats).not.toHaveBeenCalled();
    });
});

describe('signed in', () => {
    beforeEach(() => {
        mockUseSession.mockReturnValue({ data: { user: {} }, status: 'authenticated' });
    });

    it('shows the three sections with the recorded numbers', async () => {
        mockFetchStats.mockResolvedValue(PAYLOAD);
        render(<ProfileClient />);

        await waitFor(() =>
            expect(screen.getByRole('table', { name: 'Games and wins by mode' })).toBeTruthy(),
        );
        // Win rate is derived: 6/10 co-op.
        expect(screen.getByText('60%')).toBeTruthy();
        expect(screen.getByRole('status', { name: 'Play streak' }).textContent).toContain('3');
        // Best time renders through the shared clock formatting (92s → 01:32);
        // the recent-games row shows the same run, so it appears twice.
        expect(screen.getAllByText('01:32').length).toBeGreaterThan(0);
        // Board keys render as display names, never raw keys.
        expect(screen.queryByText('16x16/40')).toBeNull();
        expect(screen.getByRole('table', { name: 'Recent games' })).toBeTruthy();
        expect(screen.getByText('Lost')).toBeTruthy();
    });

    it('degrades to the unavailable panel with a retry', async () => {
        mockFetchStats.mockResolvedValue(null);
        render(<ProfileClient />);
        await waitFor(() =>
            expect(screen.getByText(/could not be loaded right now/i)).toBeTruthy(),
        );
        mockFetchStats.mockResolvedValue(PAYLOAD);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() =>
            expect(screen.getByRole('table', { name: 'Games and wins by mode' })).toBeTruthy(),
        );
    });

    it('offers the guest import only when this browser holds local bests', async () => {
        mockFetchStats.mockResolvedValue(PAYLOAD);
        recordBestTime(boardKey(9, 9, 10), { seconds: 30, players: 1, at: 1 });
        mockImportBests.mockResolvedValue(true);

        render(<ProfileClient />);
        const button = await screen.findByRole('button', { name: /Import this browser's bests \(1\)/ });
        fireEvent.click(button);

        await waitFor(() => expect(mockImportBests).toHaveBeenCalled());
        expect(mockImportBests.mock.calls[0][0]).toEqual([
            { boardKey: '9x9/10', seconds: 30, players: 1, achievedAt: 1 },
        ]);
        await waitFor(() => expect(screen.getByText(/Imported — kept wherever/)).toBeTruthy());
        clearBestTimes();
    });

    it('shows no import offer on a browser with no records', async () => {
        mockFetchStats.mockResolvedValue(PAYLOAD);
        render(<ProfileClient />);
        await screen.findByRole('table', { name: 'Games and wins by mode' });
        expect(screen.queryByRole('button', { name: /Import/ })).toBeNull();
    });
});
