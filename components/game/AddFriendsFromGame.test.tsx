// @vitest-environment jsdom
/**
 * The add-friend offer at the end of a game — the path that decides whether
 * the friend graph gets used at all, since a code is a fine way to add
 * somebody you already know and a terrible way to add the stranger a quick
 * match just paired you with.
 *
 * The list is entirely the server's (it excludes you, guests, blocks and
 * anybody who has left), so what is testable here is what the offer SAYS about
 * each state and that it asks for the list at all.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import type { RoomFriend } from '@/state/friendsSlice';

const mockStatus = vi.fn(() => 'authenticated');
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: mockStatus() }) }));

import AddFriendsFromGame from './AddFriendsFromGame';

const PAT: RoomFriend = { id: 'sock-pat', name: 'Pat', avatar: 'fox', status: 'none' };

let token = 0;
const roster = (...players: RoomFriend[]) =>
    act(() => useMinesweeperStore.getState().setRoomFriends(players, ++token));

const renderOffer = () => {
    const props = { addRoomFriend: vi.fn() };
    render(<AddFriendsFromGame {...props} />);
    return props;
};

beforeEach(() => {
    mockStatus.mockReturnValue('authenticated');
    act(() => useMinesweeperStore.getState().setRoomFriends([], ++token));
});

afterEach(cleanup);

describe('signed out', () => {
    // A guest has no graph to add anybody to, and the server sends them no
    // list — so there is nothing to draw even if one arrived.
    it('renders nothing', () => {
        mockStatus.mockReturnValue('unauthenticated');
        roster(PAT);
        const { container } = render(<AddFriendsFromGame addRoomFriend={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });
});

describe('with nobody to offer', () => {
    // An empty list means the server found nobody — not that something failed.
    it('renders nothing rather than an empty heading', () => {
        const { container } = render(<AddFriendsFromGame addRoomFriend={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });
});

describe('a co-player', () => {
    it('can be added, by socket id', () => {
        const props = renderOffer();
        roster(PAT);

        fireEvent.click(screen.getByRole('button', { name: 'Add friend: Pat' }));

        expect(props.addRoomFriend).toHaveBeenCalledWith('sock-pat');
    });

    /*
     * They asked first, so pressing this accepts rather than requests —
     * `requestFriend` folds the two together, and "Accept" is the honest word.
     */
    it('who already asked is offered as Accept', () => {
        renderOffer();
        roster({ ...PAT, status: 'incoming' });

        expect(screen.getByRole('button', { name: 'Accept: Pat' })).toBeTruthy();
    });

    it.each([
        ['friends', 'Friends: Pat'],
        ['requested', 'Requested: Pat'],
    ] as const)('already %s shows a spent button', (status, name) => {
        renderOffer();
        roster({ ...PAT, status });

        const button = screen.getByRole('button', { name }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });

    // Three "Add friend" buttons in a row are indistinguishable without it.
    it('is named on its own button', () => {
        renderOffer();
        roster(PAT, { id: 'sock-sam', name: 'Sam', avatar: null, status: 'none' });

        expect(screen.getByRole('button', { name: 'Add friend: Pat' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Add friend: Sam' })).toBeTruthy();
    });
});
