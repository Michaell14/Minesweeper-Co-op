// @vitest-environment jsdom
/**
 * The shared profile copy. The hook is covered through its consumers; this is
 * the MODULE-LEVEL cache, whose failure is showing one account to another across a sign-out.
 */
import React from 'react';
import { renderHook, waitFor, cleanup, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
}));

const mockFetchProfile = vi.fn();
vi.mock('@/lib/profileApi', async () => {
    const actual = await vi.importActual<typeof import('@/lib/profileApi')>('@/lib/profileApi');
    return { ...actual, fetchProfile: (...args: unknown[]) => mockFetchProfile(...args) };
});

import { useAccountProfile, clearAccountProfileCache } from './useAccountProfile';
import { PROFILE_UPDATED_EVENT } from '@/lib/profileApi';

const user = (displayName: string) => ({
    id: `uuid-${displayName}`,
    provider: 'github',
    email: null,
    displayName,
    avatar: 'classic',
    createdAt: '2026-08-02',
});

const signedIn = () => mockUseSession.mockReturnValue({ status: 'authenticated' });
const signedOut = () => mockUseSession.mockReturnValue({ status: 'unauthenticated' });

beforeEach(() => {
    mockUseSession.mockReset();
    mockFetchProfile.mockReset();
    clearAccountProfileCache();
});

afterEach(cleanup);

describe('the shared copy', () => {
    it('is fetched once however many consumers ask', async () => {
        signedIn();
        mockFetchProfile.mockResolvedValue(user('Miguel'));

        const first = renderHook(() => useAccountProfile());
        const second = renderHook(() => useAccountProfile());

        await waitFor(() => expect(first.result.current.resolved).toBe(true));
        await waitFor(() => expect(second.result.current.resolved).toBe(true));
        expect(mockFetchProfile).toHaveBeenCalledTimes(1);
        expect(second.result.current.profile?.displayName).toBe('Miguel');
    });

    /*
     * A fetch still in flight at sign-out would land AFTER the copy was cleared,
     * and the next sign-in reads the copy first, showing the previous person.
     */
    it('does not let a fetch outrun the sign-out that cancelled it', async () => {
        signedIn();
        let arrive!: (u: ReturnType<typeof user>) => void;
        mockFetchProfile.mockReturnValueOnce(new Promise((resolve) => { arrive = resolve; }));

        const view = renderHook(() => useAccountProfile());

        // Sign out while the first fetch is still open, then let it land.
        signedOut();
        view.rerender();
        await waitFor(() => expect(view.result.current.resolved).toBe(true));
        arrive(user('Miguel'));

        // A different account signs in.
        signedIn();
        mockFetchProfile.mockResolvedValue(user('Someone Else'));
        view.rerender();

        await waitFor(() => expect(view.result.current.profile?.displayName).toBe('Someone Else'));
    });

    /*
     * A save's update event is strictly fresher than a read that began before
     * it; the next consumer to MOUNT reads only the copy.
     */
    it('does not let a fetch overwrite a save that landed while it was open', async () => {
        signedIn();
        let arrive!: (u: ReturnType<typeof user>) => void;
        mockFetchProfile.mockReturnValueOnce(new Promise((resolve) => { arrive = resolve; }));

        renderHook(() => useAccountProfile());

        act(() => {
            window.dispatchEvent(
                new CustomEvent(PROFILE_UPDATED_EVENT, { detail: user('Renamed') }),
            );
        });
        arrive(user('Old Name'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const later = renderHook(() => useAccountProfile());

        await waitFor(() => expect(later.result.current.resolved).toBe(true));
        expect(later.result.current.profile?.displayName).toBe('Renamed');
    });
});
