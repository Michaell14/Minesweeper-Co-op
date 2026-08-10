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
const mockUpdateAvatar = vi.fn();
const mockDeleteAccount = vi.fn();
vi.mock('@/lib/profileApi', async () => {
    const actual = await vi.importActual<typeof import('@/lib/profileApi')>('@/lib/profileApi');
    return {
        ...actual,
        fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
        updateDisplayName: (...args: unknown[]) => mockUpdateDisplayName(...args),
        updateAvatar: (...args: unknown[]) => mockUpdateAvatar(...args),
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
    avatar: 'classic',
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
    mockUpdateAvatar.mockReset();
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

describe('overlapping saves across fields', () => {
    it('a rename failure is still reported after an avatar pick follows it', async () => {
        const { ProfileApiError } = await vi.importActual<typeof import('@/lib/profileApi')>(
            '@/lib/profileApi',
        );
        let rejectRename!: (error: unknown) => void;
        mockUpdateDisplayName.mockImplementationOnce(
            () => new Promise((_resolve, reject) => { rejectRename = reject; }),
        );
        mockUpdateAvatar.mockResolvedValue({ ...PROFILE, avatar: 'fox' });
        await renderReady();

        fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), {
            target: { value: 'Miguel' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Save|Saving…/ }));
        fireEvent.click(screen.getByRole('radio', { name: 'Fox' }));
        await waitFor(() => expect(mockUpdateAvatar).toHaveBeenCalled());

        // The rename fails AFTER the pick took the profile ticket — the
        // failure must not vanish and masquerade as a successful save.
        rejectRename(new ProfileApiError('Invalid display name', 400));
        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid display name'),
        );
        // …and the pick that superseded it still landed.
        expect((screen.getByRole('radio', { name: 'Fox' }) as HTMLInputElement).checked).toBe(true);
    });

    it('the re-sync never regresses a save that completed while its fetch was in flight', async () => {
        const { ProfileApiError, PROFILE_UPDATED_EVENT } = await vi.importActual<
            typeof import('@/lib/profileApi')
        >('@/lib/profileApi');
        // The pick fails and its re-sync GET reads a snapshot from BEFORE the
        // rename persists; the rename then applies while the fetch is still
        // in flight. The stale snapshot must not overwrite it — on the panel
        // or the event channel.
        mockUpdateAvatar.mockRejectedValueOnce(new ProfileApiError('Invalid avatar', 400));
        let resolveRename!: (value: unknown) => void;
        mockUpdateDisplayName.mockImplementationOnce(
            () => new Promise((resolve) => { resolveRename = resolve; }),
        );
        await renderReady();
        // Queued only AFTER the initial load consumed its fetch — this
        // deferred one belongs to the re-sync.
        let resolveFetch!: (value: unknown) => void;
        mockFetchProfile.mockImplementationOnce(
            () => new Promise((resolve) => { resolveFetch = resolve; }),
        );

        const announced: string[] = [];
        const listener = (event: Event) =>
            announced.push((event as CustomEvent).detail.displayName);
        window.addEventListener(PROFILE_UPDATED_EVENT, listener);

        fireEvent.click(screen.getByRole('radio', { name: 'Fox' }));
        await waitFor(() => expect(mockFetchProfile).toHaveBeenCalledTimes(2)); // load + re-sync

        fireEvent.click(screen.getByRole('button', { name: /Save|Saving…/ }));
        resolveRename({ ...PROFILE, displayName: 'Renamed' });
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved!'));

        resolveFetch(PROFILE); // the pre-rename snapshot arrives last
        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid avatar'),
        );
        window.removeEventListener(PROFILE_UPDATED_EVENT, listener);

        // The rename survives: the delete-confirm label reads off profile
        // state, and the stale snapshot never reached the event channel.
        expect(screen.getByText(/Type your display name \(Renamed\)/)).toBeTruthy();
        expect(announced).not.toContain('Michael');
    });

    it('an avatar failure is still reported after a rename follows it', async () => {
        const { ProfileApiError } = await vi.importActual<typeof import('@/lib/profileApi')>(
            '@/lib/profileApi',
        );
        let rejectPick!: (error: unknown) => void;
        mockUpdateAvatar.mockImplementationOnce(
            () => new Promise((_resolve, reject) => { rejectPick = reject; }),
        );
        mockUpdateDisplayName.mockResolvedValue({ ...PROFILE, displayName: 'Miguel' });
        await renderReady();

        fireEvent.click(screen.getByRole('radio', { name: 'Fox' }));
        fireEvent.click(screen.getByRole('button', { name: /Save|Saving…/ }));
        await waitFor(() => expect(mockUpdateDisplayName).toHaveBeenCalled());

        // The re-sync answers with what the server holds: the rename, no fox.
        mockFetchProfile.mockResolvedValue({ ...PROFILE, displayName: 'Miguel' });
        rejectPick(new ProfileApiError('Invalid avatar', 400));

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid avatar'),
        );
        // The optimistic pick was rolled back to the server's truth.
        expect((screen.getByRole('radio', { name: 'Smiley' }) as HTMLInputElement).checked).toBe(true);
    });
});

describe('the avatar picker', () => {
    it('offers every catalog avatar as a radio, with the stored one selected', async () => {
        await renderReady();

        const group = screen.getByRole('radiogroup', { name: 'Avatar' });
        expect(group).toBeTruthy();
        const selected = screen.getByRole('radio', { name: 'Smiley' }) as HTMLInputElement;
        expect(selected.checked).toBe(true);
        // A sample of the rest — by accessible name, which is what breaks
        // silently if a label stops resolving.
        for (const name of ['Fox', 'Penguin', 'Mushroom', 'Robot']) {
            expect(screen.getByRole('radio', { name })).toBeTruthy();
        }
    });

    it('saves a pick and keeps it selected', async () => {
        mockUpdateAvatar.mockResolvedValue({ ...PROFILE, avatar: 'fox' });
        await renderReady();

        fireEvent.click(screen.getByRole('radio', { name: 'Fox' }));

        await waitFor(() => expect(mockUpdateAvatar).toHaveBeenCalledWith('fox'));
        expect((screen.getByRole('radio', { name: 'Fox' }) as HTMLInputElement).checked).toBe(true);
    });

    it('applies only the LATEST save when responses come back out of order', async () => {
        // First pick (fox) answers slowly; second pick (penguin) answers first.
        let resolveFox!: (value: unknown) => void;
        mockUpdateAvatar.mockImplementationOnce(
            () => new Promise((resolve) => { resolveFox = resolve; }),
        );
        mockUpdateAvatar.mockResolvedValueOnce({ ...PROFILE, avatar: 'penguin' });
        await renderReady();

        fireEvent.click(screen.getByRole('radio', { name: 'Fox' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Penguin' }));
        await waitFor(() =>
            expect((screen.getByRole('radio', { name: 'Penguin' }) as HTMLInputElement).checked).toBe(true),
        );

        // The stale fox response lands last — it must be ignored.
        resolveFox({ ...PROFILE, avatar: 'fox' });
        await waitFor(() => expect(mockUpdateAvatar).toHaveBeenCalledTimes(2));
        expect((screen.getByRole('radio', { name: 'Penguin' }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('radio', { name: 'Fox' }) as HTMLInputElement).checked).toBe(false);
    });

    it('a failed save re-syncs from the server instead of restoring a stale snapshot', async () => {
        const { ProfileApiError } = await vi.importActual<typeof import('@/lib/profileApi')>(
            '@/lib/profileApi',
        );
        // Fox is picked first and persists server-side, but its response is
        // dropped by the ticket guard once penguin is picked. Penguin then
        // fails — the snapshot it captured predates fox, so restoring it
        // would show an avatar the server no longer holds.
        let resolveFox!: (value: unknown) => void;
        mockUpdateAvatar.mockImplementationOnce(
            () => new Promise((resolve) => { resolveFox = resolve; }),
        );
        let rejectPenguin!: (error: unknown) => void;
        mockUpdateAvatar.mockImplementationOnce(
            () => new Promise((_resolve, reject) => { rejectPenguin = reject; }),
        );
        await renderReady();

        fireEvent.click(screen.getByRole('radio', { name: 'Fox' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Penguin' }));

        resolveFox({ ...PROFILE, avatar: 'fox' });
        // The re-sync must answer with what the server actually holds now.
        mockFetchProfile.mockResolvedValue({ ...PROFILE, avatar: 'fox' });

        // The truth must also be ANNOUNCED: the overlapping success was
        // suppressed from the event channel, so without this the Footer
        // never hears about the avatar the server kept.
        const { PROFILE_UPDATED_EVENT } = await vi.importActual<typeof import('@/lib/profileApi')>(
            '@/lib/profileApi',
        );
        const announced: string[] = [];
        const listener = (event: Event) =>
            announced.push((event as CustomEvent).detail.avatar);
        window.addEventListener(PROFILE_UPDATED_EVENT, listener);

        rejectPenguin(new ProfileApiError('Invalid avatar', 400));

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid avatar'),
        );
        window.removeEventListener(PROFILE_UPDATED_EVENT, listener);
        expect((screen.getByRole('radio', { name: 'Fox' }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('radio', { name: 'Smiley' }) as HTMLInputElement).checked).toBe(false);
        expect(announced).toEqual(['fox']);
    });

    it('reverts the pick and says why when the save is refused', async () => {
        const { ProfileApiError } = await vi.importActual<typeof import('@/lib/profileApi')>(
            '@/lib/profileApi',
        );
        mockUpdateAvatar.mockRejectedValue(new ProfileApiError('Invalid avatar', 400));
        await renderReady();

        fireEvent.click(screen.getByRole('radio', { name: 'Fox' }));

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid avatar'),
        );
        expect((screen.getByRole('radio', { name: 'Smiley' }) as HTMLInputElement).checked).toBe(true);
    });
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
