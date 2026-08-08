// @vitest-environment jsdom
/**
 * Account management on /profile, by accessible name: the rename round-trip,
 * the unavailable escape hatch, and deletion behind the typed-name gate. The
 * gate is the part that must not fail silently — a Delete button that arms
 * without the name being typed is the old too-easy delete back again.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockSignOut = vi.fn();
vi.mock('next-auth/react', () => ({
    signOut: (...args: unknown[]) => mockSignOut(...args),
}));

const mockFetchProfile = vi.fn();
const mockUpdateDisplayName = vi.fn();
const mockDeleteAccount = vi.fn();
vi.mock('@/lib/profileApi', async () => {
    const actual = await vi.importActual<typeof import('@/lib/profileApi')>('@/lib/profileApi');
    return {
        ...actual,
        fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
        updateDisplayName: (...args: unknown[]) => mockUpdateDisplayName(...args),
        deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
    };
});

import AccountPanel from './AccountPanel';
import { DIALOGS } from '@/lib/dialogs';

/** jsdom's closed <dialog> is display:none — open it the imperative way. */
const openById = (id: string) => {
    (document.getElementById(id) as HTMLDialogElement).open = true;
};

const PROFILE = {
    id: 'uuid-1',
    provider: 'github',
    email: 'm@example.com',
    displayName: 'Michael',
    createdAt: '2026-08-02',
};

const deleteButton = () =>
    screen.getByRole('button', { name: /Delete forever|Deleting…/ }) as HTMLButtonElement;

/** Renders, waits for the profile, and opens the armed delete dialog. */
const renderReady = async () => {
    mockFetchProfile.mockResolvedValue(PROFILE);
    render(<AccountPanel />);
    await screen.findByRole('textbox', { name: 'Display name' });
};

beforeEach(() => {
    mockSignOut.mockReset();
    mockFetchProfile.mockReset();
    mockUpdateDisplayName.mockReset();
    mockDeleteAccount.mockReset();
});

afterEach(cleanup);

it('loads the profile and shows the rename control', async () => {
    await renderReady();

    const input = screen.getByRole('textbox', { name: 'Display name' }) as HTMLInputElement;
    expect(input.value).toBe('Michael');
    expect(screen.getByText(/signed in with GitHub as m@example\.com/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete account…' })).toBeTruthy();
});

it('saves a rename and confirms it', async () => {
    mockUpdateDisplayName.mockResolvedValue({ ...PROFILE, displayName: 'Miguel' });
    await renderReady();

    fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), {
        target: { value: 'Miguel' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved!'));
    expect(mockUpdateDisplayName).toHaveBeenCalledWith('Miguel');
});

it('surfaces a refused rename without closing anything', async () => {
    const { ProfileApiError } = await vi.importActual<typeof import('@/lib/profileApi')>(
        '@/lib/profileApi',
    );
    mockUpdateDisplayName.mockRejectedValue(new ProfileApiError('Invalid display name', 400));
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe('Invalid display name'),
    );
});

it('degrades to the unavailable message with sign-out still reachable', async () => {
    mockFetchProfile.mockResolvedValue(null);
    render(<AccountPanel />);
    await waitFor(() =>
        expect(screen.getByText(/could not be loaded right now/i)).toBeTruthy(),
    );
    // Sign-out must stay reachable even with no profile to show…
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    // …but deletion must not: there is no name to confirm against.
    expect(screen.queryByRole('button', { name: 'Delete account…' })).toBeNull();
});

describe('deletion', () => {
    it('stays disarmed until the display name is typed back', async () => {
        await renderReady();
        openById(DIALOGS.accountDelete);

        expect(deleteButton().disabled).toBe(true);

        const confirm = screen.getByRole('textbox', { name: 'Type your display name to confirm' });
        fireEvent.change(confirm, { target: { value: 'michael' } }); // wrong case
        expect(deleteButton().disabled).toBe(true);

        fireEvent.change(confirm, { target: { value: 'Michael' } });
        expect(deleteButton().disabled).toBe(false);
    });

    it('deletes the account then ends the session', async () => {
        mockDeleteAccount.mockResolvedValue(true);
        mockSignOut.mockResolvedValue(undefined);
        await renderReady();
        openById(DIALOGS.accountDelete);

        fireEvent.change(
            screen.getByRole('textbox', { name: 'Type your display name to confirm' }),
            { target: { value: 'Michael' } },
        );
        fireEvent.click(deleteButton());

        await waitFor(() => expect(mockDeleteAccount).toHaveBeenCalled());
        await waitFor(() =>
            expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/' }),
        );
    });

    it('keeps the session when deletion fails, and says why', async () => {
        mockDeleteAccount.mockResolvedValue(false);
        await renderReady();
        openById(DIALOGS.accountDelete);

        fireEvent.change(
            screen.getByRole('textbox', { name: 'Type your display name to confirm' }),
            { target: { value: 'Michael' } },
        );
        fireEvent.click(deleteButton());

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toMatch(/could not delete/i),
        );
        expect(mockSignOut).not.toHaveBeenCalled();
    });
});
