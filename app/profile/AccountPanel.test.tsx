// @vitest-environment jsdom
/**
 * Account management on /profile, by accessible name: rename, the unavailable
 * escape hatch, and deletion behind the typed-name gate, which must not arm
 * without the name.
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
import { PENDING_NOTE } from '@/shared/achievements';
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

const STATS = {
    coopGames: 0, coopWins: 0, pvpGames: 0, pvpWins: 0, dailyGames: 0, dailyWins: 0,
    currentStreak: 0, bestStreak: 0, lastPlayedDay: null,
    dailyCurrentStreak: 0, dailyBestStreak: 0, lastDailyDay: null,
};

/** Renders, waits for the profile, and opens the armed delete dialog. */
const renderReady = async (props: React.ComponentProps<typeof AccountPanel> = {}) => {
    mockFetchProfile.mockResolvedValue(PROFILE);
    render(<AccountPanel {...props} />);
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

        // The rename fails AFTER the pick took the ticket; the failure must still show.
        rejectRename(new ProfileApiError('Invalid display name', 400));
        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid display name'),
        );
        // …and the pick that superseded it still landed.
        expect((screen.getByRole('radio', { name: 'Fox' }) as HTMLInputElement).checked).toBe(true);
    });

    it('a failed pick reverts to the last CONFIRMED profile, not a click-time snapshot', async () => {
        const { ProfileApiError } = await vi.importActual<typeof import('@/lib/profileApi')>(
            '@/lib/profileApi',
        );
        // A rename persists before the pick fails: the revert must land on the
        // renamed profile, not a click-time snapshot.
        mockUpdateDisplayName.mockResolvedValue({ ...PROFILE, displayName: 'Renamed' });
        mockUpdateAvatar.mockRejectedValueOnce(new ProfileApiError('Invalid avatar', 400));
        await renderReady();

        fireEvent.click(screen.getByRole('button', { name: /Save|Saving…/ }));
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved!'));

        fireEvent.click(screen.getByRole('radio', { name: 'Fox' }));
        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid avatar'),
        );

        // The rename survives the revert, and the pick rolled back.
        expect(screen.getByText(/Type your display name \(Renamed\)/)).toBeTruthy();
        expect((screen.getByRole('radio', { name: 'Smiley' }) as HTMLInputElement).checked).toBe(true);
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
        // A sample of the rest, by accessible name.
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

    it('a failed pick reverts to a confirmed EARLIER pick, not the original avatar', async () => {
        const { ProfileApiError } = await vi.importActual<typeof import('@/lib/profileApi')>(
            '@/lib/profileApi',
        );
        // Fox persists server-side and is the last CONFIRMED state; when
        // penguin fails the revert must land on fox, not Smiley.
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
        rejectPenguin(new ProfileApiError('Invalid avatar', 400));

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toBe('Invalid avatar'),
        );
        expect((screen.getByRole('radio', { name: 'Fox' }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('radio', { name: 'Smiley' }) as HTMLInputElement).checked).toBe(false);
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

/*
 * The earned avatars. The server is the gate; this is whether the picker tells
 * the truth BEFORE someone clicks.
 */
describe('locked avatars', () => {
    const earned = (...ids: string[]) => ids.map((id) => ({ id, earnedAt: '2026-08-02' }));

    it('locks one the account has not earned, and says what it costs', async () => {
        await renderReady({ achievements: [], stats: STATS });

        // The requirement is part of the accessible NAME, so a screen reader hears the lock.
        const shark = screen.getByRole('radio', { name: /^Shark.*Win 100 races/ }) as HTMLInputElement;
        expect(shark.disabled).toBe(true);
    });

    it('shows progress towards it', async () => {
        await renderReady({ achievements: [], stats: { ...STATS, pvpWins: 37 } });

        expect(screen.getByRole('radio', { name: /^Shark.*37\/100/ })).toBeTruthy();
    });

    /*
     * Qualified but not yet awarded: achievements land when a game FINISHES,
     * and the badge shelf already words this moment its own way.
     */
    it('tells someone who qualifies that the award is pending', async () => {
        await renderReady({ achievements: [], stats: { ...STATS, pvpWins: 100 } });

        // Against the shared constant, so the copy and this cannot drift.
        expect(screen.getByRole('radio', {
            name: new RegExp(`^Shark.*${PENDING_NOTE}`),
        })).toBeTruthy();
    });

    it('opens once the achievement is earned', async () => {
        mockUpdateAvatar.mockResolvedValue({ ...PROFILE, avatar: 'shark' });
        await renderReady({ achievements: earned('apex-predator'), stats: STATS });

        const shark = screen.getByRole('radio', { name: /^Shark/ }) as HTMLInputElement;
        expect(shark.disabled).toBe(false);

        fireEvent.click(shark);
        await waitFor(() => expect(mockUpdateAvatar).toHaveBeenCalledWith('shark'));
    });

    it('cannot be picked while locked', async () => {
        await renderReady({ achievements: [], stats: STATS });

        fireEvent.click(screen.getByRole('radio', { name: /^Shark/ }));

        expect(mockUpdateAvatar).not.toHaveBeenCalled();
    });

    /*
     * The panel outlives the stats fetch (sign-out must stay reachable).
     * Locked is the honest answer while achievements are unknown.
     */
    it('stays locked while the achievements are still unknown', async () => {
        await renderReady();

        expect((screen.getByRole('radio', { name: /^Shark/ }) as HTMLInputElement).disabled).toBe(true);
    });

    it('leaves the free avatars alone', async () => {
        await renderReady({ achievements: [], stats: STATS });

        for (const name of ['Smiley', 'Fox', 'Mushroom']) {
            expect((screen.getByRole('radio', { name }) as HTMLInputElement).disabled).toBe(false);
        }
    });
});

/*
 * 'loading' has no way out on its own and hides sign-out. `fetchProfile`
 * answers null rather than throwing, so this is defence in depth.
 */
it('shows the unavailable state if the profile read throws', async () => {
    mockFetchProfile.mockRejectedValue(new SyntaxError('Unexpected token <'));
    render(<AccountPanel />);

    expect(await screen.findByText(/account could not be loaded right now/i)).toBeTruthy();
    // Sign-out has to survive the failure — it is the only way off the page.
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
});
