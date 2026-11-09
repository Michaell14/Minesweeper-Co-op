// @vitest-environment jsdom
/**
 * The layout's toasts load their code on first use. What fails silently: a
 * wrapper that never mounts the toast it deferred, so an unlock or an invite
 * arrives and nobody is told.
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { useMinesweeperStore } from '@/app/store';
import Toasts from './Toasts';

beforeEach(() => {
    useMinesweeperStore.setState({ unlockedQueue: [], friendInvite: null });
});

test('renders nothing while there is nothing to say', () => {
    const { container } = render(<Toasts />);
    expect(container.firstChild).toBeNull();
});

test('an unlock mounts the achievement toast', async () => {
    render(<Toasts />);
    act(() => useMinesweeperStore.getState().pushUnlocked(['sweeper']));
    expect(await screen.findByText(/Sweeper/)).toBeTruthy();
});

test('an invite mounts the invite toast', async () => {
    render(<Toasts />);
    act(() => useMinesweeperStore.getState().setFriendInvite({
        fromId: 'friend-1',
        fromName: 'Ada',
        fromAvatar: null,
        room: 'Calm-Otter',
        mode: 'co-op',
    }));
    expect(await screen.findByRole('link', { name: 'Join Ada in room Calm-Otter' })).toBeTruthy();
});
