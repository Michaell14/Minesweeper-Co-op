// @vitest-environment jsdom
/**
 * The footer's user icon is two different controls: signed out it is a
 * button opening the sign-in dialog, signed in it is a link to /profile.
 * What fails silently is the accessible name or the href — jsdom can't see
 * the icon, but the name is what screen readers and the smoke suite go by.
 */
import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
}));

const mockUsePathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({
    usePathname: () => mockUsePathname(),
}));

// The dialogs under AccountMenu have their own tests; keep this one about
// the cluster.
vi.mock('@/components/AccountMenu', () => ({
    default: () => null,
}));

vi.mock('@/app/store', () => ({
    useMinesweeperStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ playerJoined: false, dailyActive: false }),
}));

const mockFetchProfile = vi.fn();
vi.mock('@/lib/profileApi', async () => {
    const actual = await vi.importActual<typeof import('@/lib/profileApi')>('@/lib/profileApi');
    return {
        ...actual,
        fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
    };
});

import Footer from './Footer';
import { clearAccountProfileCache } from '@/hooks/useAccountProfile';
import { PROFILE_UPDATED_EVENT } from '@/lib/profileApi';
import { LATEST_ENTRY_DATE } from '@/lib/changelog';
import { DIALOGS } from '@/lib/dialogs';

beforeEach(() => {
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mockUsePathname.mockReset();
    mockUsePathname.mockReturnValue('/');
    mockFetchProfile.mockReset();
    // "Accounts unavailable" by default — signed-in tests that care about the
    // avatar set up their own answer.
    mockFetchProfile.mockResolvedValue(null);
    // The shared profile copy would otherwise serve one test's account to the
    // next, exactly as the server's identity cache does.
    clearAccountProfileCache();
    localStorage.clear();
});

afterEach(cleanup);

describe('the changelog star', () => {
    it('links to /changelog', () => {
        render(<Footer />);
        const link = screen.getByRole('link', { name: "What's new" }) as HTMLAnchorElement;
        expect(link.getAttribute('href')).toBe('/changelog');
    });

    it('shows the dot to a player who has never seen the changelog', () => {
        render(<Footer />);
        expect(screen.getByTestId('changelog-unseen-dot')).toBeTruthy();
    });

    it('shows the dot again once a newer entry exists than the one last seen', () => {
        localStorage.setItem('minesweeper_changelog_last_seen', '2020-01-01');
        render(<Footer />);
        expect(screen.getByTestId('changelog-unseen-dot')).toBeTruthy();
    });

    it('hides the dot from a player who is up to date', () => {
        localStorage.setItem('minesweeper_changelog_last_seen', LATEST_ENTRY_DATE);
        render(<Footer />);
        expect(screen.queryByTestId('changelog-unseen-dot')).toBeNull();
    });

    it('marks the changelog seen when the player lands on it', () => {
        mockUsePathname.mockReturnValue('/changelog');
        render(<Footer />);
        expect(localStorage.getItem('minesweeper_changelog_last_seen')).toBe(LATEST_ENTRY_DATE);
    });

    it('clears the dot when another tab reads the changelog', () => {
        render(<Footer />);
        expect(screen.getByTestId('changelog-unseen-dot')).toBeTruthy();
        // What the browser fires here when a second tab writes the key.
        act(() => {
            localStorage.setItem('minesweeper_changelog_last_seen', LATEST_ENTRY_DATE);
            window.dispatchEvent(new StorageEvent('storage', { key: 'minesweeper_changelog_last_seen' }));
        });
        expect(screen.queryByTestId('changelog-unseen-dot')).toBeNull();
    });
});

/**
 * The guide dialog is the only place the content pages are linked from, so a
 * dropped link takes them back to being reachable through the sitemap alone.
 * Nothing about that failure is visible in a diff that was only reformatting.
 */
describe('the how-to-play dialog', () => {
    // A closed <dialog> is display:none, so nothing inside it resolves by role.
    const openGuide = () => {
        const { container } = render(<Footer />);
        const dialog = container.querySelector<HTMLDialogElement>(`dialog#${DIALOGS.guide}`);
        if (!dialog) throw new Error('no guide dialog rendered');
        dialog.open = true;
        return dialog;
    };

    it.each([
        ['Full rules and chording', '/how-to-play'],
        ['Why these boards never need a guess', '/no-guess-minesweeper'],
        ["Today's daily challenge", '/daily'],
    ])('links %s to %s', (name, href) => {
        openGuide();
        expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(href);
    });

    it('lists the three steps in order, each numbered once', () => {
        const dialog = openGuide();
        const items = [...dialog.querySelectorAll('li')];

        // Marker and text are separate elements so a wrapped step hangs under
        // its own text; asserted apart for the same reason.
        expect(items.map((li) => li.firstElementChild?.textContent)).toEqual(['1)', '2)', '3)']);
        expect(items.map((li) => li.lastElementChild?.textContent)).toEqual([
            'Create a room code — it can be anything you want',
            'Share your room code with friends',
            'Play together!',
        ]);
    });
});

describe('the user icon', () => {
    it('signed out: a button that opens the sign-in dialog', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<Footer />);
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull();
    });

    it('signed in: a link straight to the profile', () => {
        mockUseSession.mockReturnValue({ data: { user: {} }, status: 'authenticated' });
        render(<Footer />);
        const link = screen.getByRole('link', { name: 'Profile' }) as HTMLAnchorElement;
        expect(link.getAttribute('href')).toBe('/profile');
        expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    });

    it('session still resolving: a neutral link, never a flash of "Sign in"', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'loading' });
        render(<Footer />);
        const link = screen.getByRole('link', { name: 'Account' }) as HTMLAnchorElement;
        expect(link.getAttribute('href')).toBe('/profile');
        expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    });
});

/**
 * The signed-in icon's avatar and its one ordering rule: the initial GET is
 * not part of the profile-save queue, so an update event heard while it is
 * in flight is strictly fresher — the fetch result must not apply over it.
 * The failure is silent (the icon just shows the wrong face until reload).
 */
describe('the avatar icon', () => {
    const PROFILE = {
        id: 'uuid-1',
        provider: 'github',
        email: null,
        displayName: 'Michael',
        avatar: 'classic',
        createdAt: '2026-08-02',
    };

    const profileLink = () => screen.getByRole('link', { name: 'Profile' });
    const shownAvatar = () =>
        profileLink().querySelector('svg[data-avatar]')?.getAttribute('data-avatar') ?? null;

    beforeEach(() => {
        mockUseSession.mockReturnValue({ data: { user: {} }, status: 'authenticated' });
    });

    it('shows the fetched avatar once the initial load answers', async () => {
        mockFetchProfile.mockResolvedValue({ ...PROFILE, avatar: 'robot' });
        render(<Footer />);

        await screen.findByRole('link', { name: 'Profile' });
        await vi.waitFor(() => expect(shownAvatar()).toBe('robot'));
    });

    it('an update event during the initial fetch wins over the stale result', async () => {
        let resolveFetch!: (value: unknown) => void;
        mockFetchProfile.mockImplementation(
            () => new Promise((resolve) => { resolveFetch = resolve; }),
        );
        render(<Footer />);
        await vi.waitFor(() => expect(mockFetchProfile).toHaveBeenCalled());

        // A save lands while the fetch is still open.
        act(() => {
            window.dispatchEvent(
                new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { ...PROFILE, avatar: 'fox' } }),
            );
        });
        await vi.waitFor(() => expect(shownAvatar()).toBe('fox'));

        // The pre-save snapshot arrives last — it must not regress the icon.
        await act(async () => {
            resolveFetch(PROFILE);
        });
        expect(shownAvatar()).toBe('fox');
    });
});
