// @vitest-environment jsdom
/**
 * The profile page's states by accessible name: signed out, unavailable, and
 * the populated dashboard. Local bests need no UI here — SettingsSync merges
 * them with the account in the background.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
    signOut: vi.fn(),
}));

const mockFetchStats = vi.fn();
vi.mock('@/lib/statsApi', () => ({
    fetchStats: (...args: unknown[]) => mockFetchStats(...args),
}));

// The page mounts AccountPanel (its own tests live beside it); its fetch
// needs an answer here so the panel settles instead of leaking a promise.
const mockFetchProfile = vi.fn();
vi.mock('@/lib/profileApi', async () => {
    const actual = await vi.importActual<typeof import('@/lib/profileApi')>('@/lib/profileApi');
    return {
        ...actual,
        fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
    };
});

import ProfileClient from './ProfileClient';

const PAYLOAD = {
    stats: {
        coopGames: 10, coopWins: 6,
        pvpGames: 4, pvpWins: 3,
        dailyGames: 2, dailyWins: 1,
        currentStreak: 3, bestStreak: 7,
        lastPlayedDay: '2026-08-02',
        dailyCurrentStreak: 1, dailyBestStreak: 2,
        lastDailyDay: '2026-08-01',
    },
    boardBests: [
        { boardKey: '16x16/40', seconds: 92, players: 1, achievedAt: '2026-08-01T12:00:00Z' },
        // A group clear, keyed with the `@players` suffix the sync files under.
        { boardKey: '16x16/40@3', seconds: 41, players: 3, achievedAt: '2026-08-02T12:00:00Z' },
    ],
    recentGames: [
        { mode: 'co-op', boardKey: '16x16/40', won: true, durationMs: 92500, players: 3, finishedAt: '2026-08-02T10:00:00Z' },
        { mode: 'daily', boardKey: '14x14/32', won: false, durationMs: 30000, players: 1, finishedAt: '2026-08-01T09:00:00Z' },
    ],
    dailyHistory: [
        { day: '2026-08-01', won: true, durationMs: 61000 },
    ],
};

beforeEach(() => {
    localStorage.clear();
    mockUseSession.mockReset();
    mockFetchStats.mockReset();
    mockFetchProfile.mockReset();
    mockFetchProfile.mockResolvedValue({
        id: 'uuid-1',
        provider: 'github',
        email: 'm@example.com',
        displayName: 'Michael',
        createdAt: '2026-08-02',
    });
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

    it('shows the sections with the recorded numbers', async () => {
        mockFetchStats.mockResolvedValue(PAYLOAD);
        render(<ProfileClient />);

        await waitFor(() =>
            expect(screen.getByRole('table', { name: 'Games and wins by mode' })).toBeTruthy(),
        );
        // The daily section rides the same payload.
        expect(screen.getByRole('list', { name: /Daily results for/ })).toBeTruthy();
        // Win rate is derived: 6/10 co-op.
        expect(screen.getByText('60%')).toBeTruthy();
        expect(screen.getByRole('status', { name: 'Play streak' }).textContent).toContain('3');
        // Best time renders through the shared clock formatting (92s → 01:32);
        // the recent-games row shows the same run, so it appears twice.
        expect(screen.getAllByText('01:32').length).toBeGreaterThan(0);
        // Board keys render as display names, never raw keys — including a
        // group clear's `@players`-suffixed key.
        expect(screen.queryByText('16x16/40')).toBeNull();
        expect(screen.queryByText('16x16/40@3')).toBeNull();
        expect(screen.getAllByText('00:41').length).toBeGreaterThan(0);
        expect(screen.getByRole('table', { name: 'Recent games' })).toBeTruthy();
        expect(screen.getByText('Lost')).toBeTruthy();
        // Account management follows the stats, deletion last and low-key.
        await screen.findByRole('textbox', { name: 'Display name' });
        expect(screen.getByRole('button', { name: 'Delete account…' })).toBeTruthy();
    });

    it('tolerates a backend payload that predates the daily-history fields', async () => {
        // The two halves deploy from one trunk but never land atomically.
        const { dailyHistory: _dropped, ...oldPayload } = PAYLOAD;
        const { dailyCurrentStreak: _a, dailyBestStreak: _b, lastDailyDay: _c, ...oldStats } = PAYLOAD.stats;
        mockFetchStats.mockResolvedValue({ ...oldPayload, stats: oldStats });
        render(<ProfileClient />);

        await waitFor(() =>
            expect(screen.getByRole('table', { name: 'Games and wins by mode' })).toBeTruthy(),
        );
        // The daily section still renders, just empty.
        expect(screen.getByRole('list', { name: /Daily results for/ })).toBeTruthy();
        expect(screen.getByText(/No dailies recorded yet/)).toBeTruthy();
    });

    it('degrades to the unavailable panel with a retry', async () => {
        mockFetchStats.mockResolvedValue(null);
        render(<ProfileClient />);
        await waitFor(() =>
            expect(screen.getByText(/stats could not be loaded right now/i)).toBeTruthy(),
        );
        // The account panel still renders below — sign-out stays reachable.
        await screen.findByRole('button', { name: 'Sign out' });
        mockFetchStats.mockResolvedValue(PAYLOAD);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() =>
            expect(screen.getByRole('table', { name: 'Games and wins by mode' })).toBeTruthy(),
        );
    });

    it('offers no import button — the sync owns local bests now', async () => {
        mockFetchStats.mockResolvedValue(PAYLOAD);
        render(<ProfileClient />);
        await screen.findByRole('table', { name: 'Games and wins by mode' });
        expect(screen.queryByRole('button', { name: /Import/ })).toBeNull();
    });
});
