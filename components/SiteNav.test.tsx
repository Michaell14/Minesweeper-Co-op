// @vitest-environment jsdom
/**
 * The header is the site's only navigation. Everything here fails silently: a
 * destination that stops resolving by name, a wrong route, a missing dot.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
}));

const mockUsePathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({
    usePathname: () => mockUsePathname(),
}));

const mockFetchProfile = vi.fn();
vi.mock('@/lib/profileApi', async () => {
    const actual = await vi.importActual<typeof import('@/lib/profileApi')>('@/lib/profileApi');
    return { ...actual, fetchProfile: (...args: unknown[]) => mockFetchProfile(...args) };
});

import SiteNav from './SiteNav';
import { clearAccountProfileCache } from '@/hooks/useAccountProfile';
import { LATEST_ENTRY_DATE } from '@/lib/changelog';

beforeEach(() => {
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue('/');
    mockFetchProfile.mockReset();
    mockFetchProfile.mockResolvedValue(null);
    clearAccountProfileCache();
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    localStorage.clear();
});

const href = (name: string | RegExp) =>
    screen.getByRole('link', { name }).getAttribute('href');

describe('destinations', () => {
    it.each([
        ['Minesweeper Co-op', '/'],
        ['Play', '/'],
        ['Daily', '/daily'],
        ['Drills', '/drills'],
        ['How to play', '/how-to-play'],
        ['No-guess', '/no-guess-minesweeper'],
        ["What's new", '/changelog'],
        ['Settings', '/settings'],
    ])('links %s to %s', (name, target) => {
        render(<SiteNav />);
        expect(href(name)).toBe(target);
    });

    /*
     * /no-guess-minesweeper is published for search and the header is its only
     * front door, so a name that stops resolving takes the page off the map.
     */
    it('exposes no-guess on every route, not just the landing page', () => {
        mockUsePathname.mockReturnValue('/settings');
        render(<SiteNav />);
        expect(href('No-guess')).toBe('/no-guess-minesweeper');
    });

    /* /drills had no entry point at all before this header. */
    it('exposes drills on every route, not just the landing page', () => {
        mockUsePathname.mockReturnValue('/settings');
        render(<SiteNav />);
        expect(href('Drills')).toBe('/drills');
    });

    it('opens the repository in a new tab, safely', () => {
        render(<SiteNav />);
        const github = screen.getByRole('link', { name: /github/i });
        expect(github.getAttribute('target')).toBe('_blank');
        expect(github.getAttribute('rel')).toContain('noopener');
    });
});

describe('the current route', () => {
    it('marks the active link', () => {
        mockUsePathname.mockReturnValue('/drills');
        render(<SiteNav />);
        expect(screen.getByRole('link', { name: 'Drills' }).getAttribute('aria-current')).toBe('page');
    });

    it('marks nothing else', () => {
        mockUsePathname.mockReturnValue('/drills');
        render(<SiteNav />);
        expect(screen.getByRole('link', { name: 'Play' }).getAttribute('aria-current')).toBeNull();
    });

    /* Play is '/', a prefix of every route; prefix matching would light it up permanently. */
    it('does not light up Play on a sub-route', () => {
        mockUsePathname.mockReturnValue('/daily');
        render(<SiteNav />);
        expect(screen.getByRole('link', { name: 'Play' }).getAttribute('aria-current')).toBeNull();
        expect(screen.getByRole('link', { name: 'Daily' }).getAttribute('aria-current')).toBe('page');
    });
});

describe('the account control', () => {
    it('is a sign-in button when signed out', () => {
        render(<SiteNav />);
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
    });

    it('is a link to the profile when signed in', () => {
        mockUseSession.mockReturnValue({ data: {}, status: 'authenticated' });
        render(<SiteNav />);
        expect(href('Profile')).toBe('/profile');
    });

    /* "Still loading" must not flash a sign-in button at every signed-in player. */
    it('points a still-resolving session at the profile', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'loading' });
        render(<SiteNav />);
        expect(href('Account')).toBe('/profile');
    });
});

describe('the changelog dot', () => {
    it('shows for a player who has never read it', () => {
        render(<SiteNav />);
        expect(screen.getByTestId('changelog-unseen-dot')).toBeTruthy();
    });

    it('hides for a player who is up to date', () => {
        localStorage.setItem('minesweeper_changelog_last_seen', LATEST_ENTRY_DATE);
        render(<SiteNav />);
        expect(screen.queryByTestId('changelog-unseen-dot')).toBeNull();
    });

    it('marks the changelog seen on arrival', () => {
        mockUsePathname.mockReturnValue('/changelog');
        render(<SiteNav />);
        expect(localStorage.getItem('minesweeper_changelog_last_seen')).toBe(LATEST_ENTRY_DATE);
    });
});
