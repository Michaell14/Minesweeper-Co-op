// @vitest-environment jsdom
/**
 * Who gets asked for a name.
 *
 * The smoke suite is signed OUT, so it exercises the dialog path and nothing
 * else — these tests are the whole net for the signed-in one. Both directions
 * fail quietly: a signed-in player asked for a name they already have, or a
 * guest sent straight into a room with no name at all.
 */
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
}));

const mockFetchProfile = vi.fn();
vi.mock('@/lib/profileApi', async () => {
    const actual = await vi.importActual<typeof import('@/lib/profileApi')>('@/lib/profileApi');
    return {
        ...actual,
        fetchProfile: (...args: unknown[]) => mockFetchProfile(...args),
    };
});

/*
 * `openDialog` is spied rather than observed: this jsdom has no showModal at
 * all, so a <dialog> here can never report itself open. Asserting the CALL is
 * also the more precise question — whether the name gate decided to ask.
 */
const mockOpenDialog = vi.fn();
vi.mock('@/lib/dialogs', async () => {
    const actual = await vi.importActual<typeof import('@/lib/dialogs')>('@/lib/dialogs');
    return { ...actual, openDialog: (...args: unknown[]) => mockOpenDialog(...args) };
});

// The board-size cards and the best-time panel have their own coverage; this
// file is about the name gate, and they drag the whole store in with them.
vi.mock('@/components/landing/AnnouncementBanner', () => ({ default: () => null }));
vi.mock('@/components/game/BestForBoard', () => ({ default: () => null }));

import Landing from './Landing';
import { clearAccountProfileCache } from '@/hooks/useAccountProfile';
import { DIALOGS } from '@/lib/dialogs';
import { useMinesweeperStore } from '@/app/store';

const PROFILE = {
    id: 'uuid-1',
    provider: 'github',
    email: 'm@example.com',
    displayName: 'Miguel',
    avatar: 'classic',
    createdAt: '2026-08-02',
};

const actions = {
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    findMatch: vi.fn(),
    cancelMatch: vi.fn(),
    startPracticeRace: vi.fn(),
};

const renderLanding = () => render(<Landing {...actions} />);

const signedIn = () => {
    mockUseSession.mockReturnValue({ status: 'authenticated' });
    mockFetchProfile.mockResolvedValue(PROFILE);
};

const signedOut = () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated' });
    mockFetchProfile.mockResolvedValue(null);
};

beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
    mockOpenDialog.mockReset();
    clearAccountProfileCache();
    mockUseSession.mockReset();
    mockFetchProfile.mockReset();
    useMinesweeperStore.getState().setName('');
    useMinesweeperStore.getState().setRoom('');
    window.history.replaceState(null, '', '/');
});

afterEach(cleanup);

const submitCreate = async () => {
    const form = screen.getByRole('form', { name: 'Create new room form' });
    fireEvent.input(form.querySelector('input') as HTMLInputElement, { target: { value: 'testroom' } });
    fireEvent.submit(form);
};

describe('a signed-in player', () => {
    it('creates a room without being asked for a name', async () => {
        signedIn();
        renderLanding();
        await waitFor(() => expect(useMinesweeperStore.getState().name).toBe('Miguel'));

        await submitCreate();

        await waitFor(() => expect(actions.createRoom).toHaveBeenCalled());
        expect(mockOpenDialog).not.toHaveBeenCalledWith(DIALOGS.nameCreate);
    });

    it('quick matches without being asked', async () => {
        signedIn();
        renderLanding();
        await waitFor(() => expect(useMinesweeperStore.getState().name).toBe('Miguel'));

        fireEvent.click(screen.getByRole('button', { name: /Quick match/i }));

        expect(actions.findMatch).toHaveBeenCalled();
        expect(mockOpenDialog).not.toHaveBeenCalledWith(DIALOGS.nameMatch);
    });

    /*
     * The name is seeded into the store even though the server prefers its own
     * snapshot — it is the only name the emit carries if the handshake's token
     * did not resolve server-side.
     */
    it('carries its account name in the store for the emit', async () => {
        signedIn();
        renderLanding();

        await waitFor(() => expect(useMinesweeperStore.getState().name).toBe('Miguel'));
    });
});

describe('a signed-out player', () => {
    it('is still asked for a name before creating', async () => {
        signedOut();
        renderLanding();
        await waitFor(() => expect(mockFetchProfile).not.toHaveBeenCalled());

        await submitCreate();

        await waitFor(() => expect(mockOpenDialog).toHaveBeenCalledWith(DIALOGS.nameCreate));
        expect(actions.createRoom).not.toHaveBeenCalled();
    });

    it('is still asked before quick matching', async () => {
        signedOut();
        renderLanding();

        fireEvent.click(screen.getByRole('button', { name: /Quick match/i }));

        await waitFor(() => expect(mockOpenDialog).toHaveBeenCalledWith(DIALOGS.nameMatch));
        expect(actions.findMatch).not.toHaveBeenCalled();
    });
});

/*
 * The window between mount and the profile arriving. A guest and a signed-in
 * player look identical here, and the join-link path decides on mount — so
 * getting this wrong sends signed-in players to a dialog they should not see.
 */
describe('while the account is still loading', () => {
    it('asks rather than guessing', async () => {
        mockUseSession.mockReturnValue({ status: 'loading' });
        mockFetchProfile.mockReturnValue(new Promise(() => {}));
        renderLanding();

        await submitCreate();

        await waitFor(() => expect(mockOpenDialog).toHaveBeenCalledWith(DIALOGS.nameCreate));
        expect(actions.createRoom).not.toHaveBeenCalled();
    });
});

/*
 * The join link (?room=...) is the one path that decides on MOUNT, before an
 * account can possibly have loaded — which is why the forms take a tri-state
 * prop instead of a plain optional. Collapsing "guest" and "not yet" sends
 * every signed-in player arriving by link to a dialog they should never see.
 */
describe('arriving by join link', () => {
    const withLink = () => window.history.replaceState(null, '', '/?room=shared');

    it('takes a signed-in player straight in', async () => {
        signedIn();
        withLink();
        renderLanding();

        await waitFor(() => expect(actions.joinRoom).toHaveBeenCalled());
        expect(mockOpenDialog).not.toHaveBeenCalledWith(DIALOGS.nameJoin);
        expect(useMinesweeperStore.getState().room).toBe('shared');
    });

    it('still asks a guest', async () => {
        signedOut();
        withLink();
        renderLanding();

        await waitFor(() => expect(mockOpenDialog).toHaveBeenCalledWith(DIALOGS.nameJoin));
        expect(actions.joinRoom).not.toHaveBeenCalled();
    });

    it('waits for a late account rather than asking', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated' });
        let arrive!: (user: typeof PROFILE) => void;
        mockFetchProfile.mockReturnValue(new Promise((resolve) => { arrive = resolve; }));
        withLink();
        renderLanding();

        // Nothing decided yet: no dialog, no join.
        expect(mockOpenDialog).not.toHaveBeenCalledWith(DIALOGS.nameJoin);
        expect(actions.joinRoom).not.toHaveBeenCalled();

        arrive(PROFILE);

        await waitFor(() => expect(actions.joinRoom).toHaveBeenCalled());
        expect(mockOpenDialog).not.toHaveBeenCalledWith(DIALOGS.nameJoin);
    });
});

/*
 * `fetchProfile` answers with null rather than throwing, but the hook must not
 * DEPEND on that: `resolved` gates the join-link path, so a promise that never
 * settles is a landing page that silently does nothing — no room joined, and
 * no name dialog offered either.
 */
describe('when the profile fetch rejects outright', () => {
    it('still falls back to asking, rather than hanging on a join link', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated' });
        mockFetchProfile.mockRejectedValue(new SyntaxError('Unexpected token <'));
        window.history.replaceState(null, '', '/?room=shared');

        renderLanding();

        await waitFor(() => expect(mockOpenDialog).toHaveBeenCalledWith(DIALOGS.nameJoin));
        expect(actions.joinRoom).not.toHaveBeenCalled();
    });

    it('still asks before creating', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated' });
        mockFetchProfile.mockRejectedValue(new SyntaxError('Unexpected token <'));
        renderLanding();

        await submitCreate();

        await waitFor(() => expect(mockOpenDialog).toHaveBeenCalledWith(DIALOGS.nameCreate));
        expect(actions.createRoom).not.toHaveBeenCalled();
    });
});
