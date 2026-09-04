// @vitest-environment jsdom
/**
 * The invite toast. What fails silently: an offer that never goes away (the
 * room fills up behind it) and a Join that stops being a link — accepting is a
 * NAVIGATION into the existing join flow, not a socket call.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import FriendInviteToast from './FriendInviteToast';

type Invite = NonNullable<ReturnType<typeof useMinesweeperStore.getState>['friendInvite']>;

const INVITE: Invite = {
    fromId: 'uuid-pat',
    fromName: 'Pat',
    fromAvatar: 'fox',
    room: 'wired-room',
    mode: 'co-op',
};

const offer = (over: Partial<Invite> = {}) =>
    act(() => useMinesweeperStore.getState().setFriendInvite({ ...INVITE, ...over }));

beforeEach(() => act(() => useMinesweeperStore.getState().setFriendInvite(null)));

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    act(() => useMinesweeperStore.getState().setFriendInvite(null));
});

describe('with nothing offered', () => {
    it('renders nothing at all', () => {
        const { container } = render(<FriendInviteToast />);
        expect(container.firstChild).toBeNull();
    });
});

describe('an offer', () => {
    it('names who sent it and which room', () => {
        render(<FriendInviteToast />);
        offer();

        expect(screen.getByText('Pat')).toBeTruthy();
        expect(screen.getByText(/wired-room/)).toBeTruthy();
    });

    it('says which kind of game it is', () => {
        render(<FriendInviteToast />);
        offer({ mode: 'pvp' });

        expect(screen.getByText(/a race/)).toBeTruthy();
    });

    /*
     * A link, not a button. The `?room=` flow already fills the code, asks for
     * a name, and copes with a full room; this player may be mid-game elsewhere.
     */
    it('accepts by navigating into the existing join flow', () => {
        render(<FriendInviteToast />);
        offer();

        const join = screen.getByRole('link', { name: 'Join Pat in room wired-room' });
        expect(join.getAttribute('href')).toBe('/?room=wired-room');
    });

    it('encodes a room code that needs it', () => {
        render(<FriendInviteToast />);
        offer({ room: 'a room/with?punctuation' });

        const join = screen.getByRole('link', { name: /^Join Pat in room / });
        expect(join.getAttribute('href')).toBe('/?room=a%20room%2Fwith%3Fpunctuation');
    });

    it('can be dismissed', () => {
        render(<FriendInviteToast />);
        offer();

        fireEvent.click(screen.getByRole('button', { name: "Dismiss Pat's invite" }));

        expect(useMinesweeperStore.getState().friendInvite).toBeNull();
        expect(screen.queryByText('Pat')).toBeNull();
    });

    it('clears itself, so a stale room never sits there offering a seat', () => {
        vi.useFakeTimers();
        render(<FriendInviteToast />);
        offer();

        act(() => void vi.advanceTimersByTime(21_000));

        expect(screen.queryByText('Pat')).toBeNull();
    });

    // Announced, not interrupting: an invite is a question arriving mid-game.
    it('is announced politely', () => {
        const { container } = render(<FriendInviteToast />);
        offer();
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
        expect(container.querySelector('[aria-live="assertive"]')).toBeNull();
    });
});

describe('two invites', () => {
    // One at a time, newest wins: a pile of invites asks somebody to pick while the first fills up.
    it('shows only the newer one', () => {
        render(<FriendInviteToast />);
        offer();
        offer({ fromId: 'uuid-sam', fromName: 'Sam', room: 'other-room' });

        expect(screen.getByText('Sam')).toBeTruthy();
        expect(screen.queryByText('Pat')).toBeNull();
    });
});
