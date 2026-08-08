// @vitest-environment jsdom
/**
 * The sign-in dialog by accessible name — what fails silently here is a
 * sign-in button whose provider stops resolving. Sign-in itself is a
 * full-page redirect, so the assertions stop at "the right control calls the
 * right function". Account management (rename, sign out, delete) lives on
 * /profile now — see app/profile/AccountPanel.test.tsx.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
const mockSignIn = vi.fn();
const mockGetProviders = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
    signIn: (...args: unknown[]) => mockSignIn(...args),
    getProviders: () => mockGetProviders(),
}));

// The signed-in safety net navigates; outside a real Next router the hook throws.
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
}));

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

beforeEach(() => {
    mockUseSession.mockReset();
    mockSignIn.mockReset();
    mockGetProviders.mockReset();
    mockPush.mockReset();
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
    it('points at the profile instead of dead-ending', () => {
        mockUseSession.mockReturnValue({ data: { user: {} }, status: 'authenticated' });
        renderOpen();
        // jsdom's <dialog> has no close(); the click below closes-then-navigates.
        const dialog = document.getElementById(DIALOGS.account) as HTMLDialogElement;
        dialog.close = () => { dialog.open = false; };

        fireEvent.click(screen.getByRole('button', { name: 'View your profile' }));
        expect(mockPush).toHaveBeenCalledWith('/profile');
        expect(mockGetProviders).not.toHaveBeenCalled();
    });
});
