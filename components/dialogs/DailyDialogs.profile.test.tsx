// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DailyDialogs from './DailyDialogs';
import { useMinesweeperStore } from '@/app/store';
import { clearAccountProfileCache } from '@/hooks/useAccountProfile';
import { DIALOGS } from '@/lib/dialogs';

vi.mock('next-auth/react', () => ({
    useSession: () => ({ status: 'authenticated' }),
}));
vi.mock('@/lib/authBridge', () => ({ getBridgeToken: async () => 'token' }));
vi.mock('@/lib/initSocket', () => ({ serverURL: 'http://test' }));

afterEach(() => {
    cleanup();
    clearAccountProfileCache();
    useMinesweeperStore.getState().resetDailyState();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

it('can submit a solved daily when the signed-in profile request is still unanswered after a minute', async () => {
    vi.useFakeTimers();
    clearAccountProfileCache();
    // Keep the actual hook and profile API: a mocked resolved flag would miss
    // the dependency that used to keep the submit control disabled forever.
    let arrive!: (response: unknown) => void;
    const fetchMock = vi.fn(() => new Promise((resolve) => { arrive = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    useMinesweeperStore.getState().setDailyStatus('won_pending_submit');
    const submit = vi.fn();
    render(<DailyDialogs submitDailyScore={submit} getDailyLeaderboard={vi.fn()} />);
    const dialog = document.getElementById(DIALOGS.dailySubmit) as HTMLDialogElement;
    dialog.open = true;
    const button = within(dialog).getByRole('button', { name: 'Submit your time to the leaderboard' });
    expect(button).toHaveProperty('disabled', true);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button).toHaveProperty('disabled', false);
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Fallback' } });
    fireEvent.submit(dialog.querySelector('form')!);
    expect(submit).toHaveBeenCalledExactlyOnceWith('Fallback');
    expect(dialog.open).toBe(true); // Only the server's acknowledgement closes it.

    // An eventual stale answer cannot undo the fallback or send a second score.
    await act(async () => {
        arrive({ ok: true, json: async () => ({ user: { displayName: 'Late name' } }) });
    });
    expect(within(dialog).getByRole('textbox')).toHaveProperty('value', 'Fallback');
    expect(submit).toHaveBeenCalledTimes(1);
});
