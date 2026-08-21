// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { boardKey, clearBestTimes, hasImportedBests, recordBestTime, type BestTime } from '@/lib/bestTimes';

/**
 * The lifecycle nobody sees: who the store's account records belong to, and
 * the one-time fold-in of what this browser already held.
 *
 * Both behaviours fail silently. Skip the clear on sign-out and a shared
 * machine shows one account's records to whoever signs in next, with nothing
 * visibly wrong. Skip the fold-in and everyone playing today loses their times
 * from the in-game banner on the day the account read ships — every record in
 * existence is in localStorage.
 */

const mockStatus = vi.fn<() => string>(() => 'unauthenticated');
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: mockStatus() }) }));

const mockFetchBoardBests = vi.fn<() => Promise<Record<string, BestTime> | null>>(async () => null);
const mockImportBests = vi.fn<(bests: unknown[]) => Promise<boolean>>(async () => true);
vi.mock('@/lib/statsApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/statsApi')>();
    return {
        ...actual,
        fetchBoardBests: () => mockFetchBoardBests(),
        importBests: (bests: unknown[]) => mockImportBests(bests),
    };
});

import BestsSync from './BestsSync';

const state = () => useMinesweeperStore.getState();

const signedIn = async () => {
    mockStatus.mockReturnValue('authenticated');
    const view = render(<BestsSync />);
    // The effect's chain is two awaits deep; let both settle.
    await act(async () => {});
    return view;
};

beforeEach(() => {
    clearBestTimes();
    mockStatus.mockReturnValue('unauthenticated');
    mockFetchBoardBests.mockReset().mockResolvedValue(null);
    mockImportBests.mockReset().mockResolvedValue(true);
});

afterEach(() => {
    clearBestTimes();
    act(() => state().setAccountBests(null));
});

describe('who the records belong to', () => {
    test('signing in loads the account table into the store', async () => {
        mockFetchBoardBests.mockResolvedValue({ '9x9/10': { seconds: 42, players: 1, at: 1 } });

        await signedIn();

        await waitFor(() => expect(state().accountBests?.['9x9/10'].seconds).toBe(42));
    });

    test('signing out drops them, rather than showing them to whoever is next', async () => {
        mockFetchBoardBests.mockResolvedValue({ '9x9/10': { seconds: 42, players: 1, at: 1 } });
        const { rerender } = await signedIn();
        await waitFor(() => expect(state().accountBests).not.toBeNull());

        mockStatus.mockReturnValue('unauthenticated');
        await act(async () => rerender(<BestsSync />));

        expect(state().accountBests).toBeNull();
    });

    test('signed out, it never asks the server for anything', async () => {
        render(<BestsSync />);
        await act(async () => {});

        expect(mockFetchBoardBests).not.toHaveBeenCalled();
        expect(mockImportBests).not.toHaveBeenCalled();
    });

    /* Stats being down leaves the browser's own records in play, not a blank. */
    test('a failed fetch leaves the store on the browser copy', async () => {
        mockFetchBoardBests.mockResolvedValue(null);

        await signedIn();

        expect(state().accountBests).toBeNull();
    });
});

describe('folding this browser\'s records in', () => {
    test('sends what this browser holds, once', async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 5 });
        recordBestTime(boardKey(16, 16, 40, 3), { seconds: 120, players: 3, at: 9 });

        await signedIn();

        expect(mockImportBests).toHaveBeenCalledTimes(1);
        // Newest first, and keyed exactly as stored — group suffix included.
        expect(mockImportBests.mock.calls[0][0]).toEqual([
            { boardKey: '16x16/40@3', seconds: 120, players: 3, achievedAt: 9 },
            { boardKey: '9x9/10', seconds: 95, players: 1, achievedAt: 5 },
        ]);
        expect(hasImportedBests()).toBe(true);
    });

    test('the fetch happens after the import, so it sees what was folded in', async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 5 });
        const order: string[] = [];
        mockImportBests.mockImplementation(async () => {
            order.push('import');
            return true;
        });
        mockFetchBoardBests.mockImplementation(async () => {
            order.push('fetch');
            return null;
        });

        await signedIn();

        expect(order).toEqual(['import', 'fetch']);
    });

    test('a second sign-in does not repeat it', async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 5 });
        const { unmount } = await signedIn();
        unmount();

        await signedIn();

        expect(mockImportBests).toHaveBeenCalledTimes(1);
    });

    /* Unmarked on failure: the next sign-in tries again rather than losing them. */
    test('a failed import is retried next time', async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 5 });
        mockImportBests.mockResolvedValue(false);
        const { unmount } = await signedIn();
        unmount();
        expect(hasImportedBests()).toBe(false);

        mockImportBests.mockResolvedValue(true);
        await signedIn();

        expect(mockImportBests).toHaveBeenCalledTimes(2);
    });

    test('nothing to fold in sends nothing, and still leaves the offer open', async () => {
        await signedIn();

        expect(mockImportBests).not.toHaveBeenCalled();
        // Not marked: this browser may yet be played on signed out, and those
        // records deserve the same fold-in.
        expect(hasImportedBests()).toBe(false);
    });
});
