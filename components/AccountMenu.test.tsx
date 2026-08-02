// @vitest-environment jsdom
/**
 * The account dialogs' three states, by accessible name — what fails silently
 * here is a sign-in button whose provider stops resolving, or a rename control
 * that loses its name. Sign-in/out themselves are full-page redirects, so the
 * assertions stop at "the right control calls the right function".
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockGetProviders = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
    signIn: (...args: unknown[]) => mockSignIn(...args),
    signOut: (...args: unknown[]) => mockSignOut(...args),
    getProviders: () => mockGetProviders(),
}));

const mockFetchProfile = vi.fn();
const mockUpdateDisplayName = vi.fn();
const mockDeleteAccount = vi.fn();
vi.mock('@/lib/profileApi', async () => {
    const actual = await vi.importActual<typeof import('@/lib/profileApi')>('@/lib/profileApi');
    return {
        ProfileApiError: actual.ProfileApiError,
        fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
        updateDisplayName: (...args: unknown[]) => mockUpdateDisplayName(...args),
        deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
    };
});

import AccountMenu from './AccountMenu';
import { DIALOGS } from '@/lib/dialogs';

/**
 * jsdom's closed <dialog> is display:none, so its contents are invisible to
 * getByRole. `open = true` matches the imperative openDialog() the app uses
 * (same pattern as DailyDialogs.test.tsx).
 */
const openById = (id: string) => {
    (document.getElementById(id) as HTMLDialogElement).open = true;
};

const renderOpen = (id: string = DIALOGS.account) => {
    const result = render(<AccountMenu />);
    openById(id);
    return result;
};

const PROFILE = {
    id: 'uuid-1',
    provider: 'github',
    email: 'm@example.com',
    displayName: 'Michael',
    createdAt: '2026-08-02',
};

beforeEach(() => {
    mockUseSession.mockReset();
    mockSignIn.mockReset();
    mockSignOut.mockReset();
    mockGetProviders.mockReset();
    mockFetchProfile.mockReset();
    mockUpdateDisplayName.mockReset();
    mockDeleteAccount.mockReset();
});

afterEach(cleanup);

describe('signed out', () => {
    beforeEach(() => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    });

    it('offers one sign-in button per configured provider', async () => {
        mockGetProviders.mockResolvedValue({
            github: { id: 'github', name: 'GitHub' },
            google: { id: 'google', name: 'Google' },
        });
        renderOpen();

        const github = await screen.findByRole('button', { name: 'Sign in with GitHub' });
        fireEvent.click(github);
        expect(mockSignIn).toHaveBeenCalledWith('github');
        expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
    });

    it('says so when no provider is configured, instead of a dead button', async () => {
        mockGetProviders.mockResolvedValue(null);
        renderOpen();
        await waitFor(() =>
            expect(screen.getByText(/sign-in is not set up/i)).toBeTruthy(),
        );
        expect(screen.queryByRole('button', { name: /sign in with/i })).toBeNull();
    });
});

describe('signed in', () => {
    beforeEach(() => {
        mockUseSession.mockReturnValue({ data: { user: {} }, status: 'authenticated' });
    });

    it('loads the profile and shows the rename control', async () => {
        mockFetchProfile.mockResolvedValue(PROFILE);
        renderOpen();

        const input = (await screen.findByRole('textbox', {
            name: 'Display name',
        })) as HTMLInputElement;
        expect(input.value).toBe('Michael');
        expect(screen.getByText(/signed in with GitHub as m@example\.com/i)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Delete account…' })).toBeTruthy();
    });

    it('saves a rename and confirms it', async () => {
        mockFetchProfile.mockResolvedValue(PROFILE);
        mockUpdateDisplayName.mockResolvedValue({ ...PROFILE, displayName: 'Miguel' });
        renderOpen();

        const input = await screen.findByRole('textbox', { name: 'Display name' });
        fireEvent.change(input, { target: { value: 'Miguel' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved!'));
        expect(mockUpdateDisplayName).toHaveBeenCalledWith('Miguel');
    });

    it('surfaces a refused rename without closing anything', async () => {
        const { ProfileApiError } = await vi.importActual<typeof import('@/lib/profileApi')>(
            '@/lib/profileApi',
        );
        mockFetchProfile.mockResolvedValue(PROFILE);
        mockUpdateDisplayName.mockRejectedValue(new ProfileApiError('Invalid display name', 400));
        renderOpen();

        fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid display name'),
        );
    });

    it('degrades to the unavailable message when the game server cannot answer', async () => {
        mockFetchProfile.mockResolvedValue(null);
        renderOpen();
        await waitFor(() =>
            expect(screen.getByText(/could not be loaded right now/i)).toBeTruthy(),
        );
        // Sign-out must stay reachable even with no profile to show.
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    });

    it('deletes the account then ends the session', async () => {
        mockFetchProfile.mockResolvedValue(PROFILE);
        mockDeleteAccount.mockResolvedValue(true);
        mockSignOut.mockResolvedValue(undefined);
        renderOpen();
        await screen.findByRole('textbox', { name: 'Display name' });
        openById(DIALOGS.accountDelete);

        fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

        await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled());
        await waitFor(() =>
            expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' }),
        );
    });

    it('keeps the session when deletion fails, and says why', async () => {
        mockFetchProfile.mockResolvedValue(PROFILE);
        mockDeleteAccount.mockResolvedValue(false);
        renderOpen();
        await screen.findByRole('textbox', { name: 'Display name' });
        openById(DIALOGS.accountDelete);

        fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toMatch(/could not delete/i),
        );
        expect(mockSignOut).not.toHaveBeenCalled();
    });
});
