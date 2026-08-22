// @vitest-environment jsdom
/**
 * The friends panel's silent failures: an outage that renders as an empty
 * graph ("you have no friends" and "we cannot tell" are different sentences),
 * a refused code that looks like it worked, and request rows whose buttons
 * stop naming who they act on — three Accept buttons with no name attached are
 * unusable to a screen reader.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const fetchFriends = vi.fn();
const addFriendByCode = vi.fn();
const updateFriendship = vi.fn();
const removeFriend = vi.fn();

vi.mock('@/lib/friendsApi', () => ({
    fetchFriends: (...args: unknown[]) => fetchFriends(...args),
    addFriendByCode: (...args: unknown[]) => addFriendByCode(...args),
    updateFriendship: (...args: unknown[]) => updateFriendship(...args),
    removeFriend: (...args: unknown[]) => removeFriend(...args),
}));

import FriendsPanel from './FriendsPanel';

const PAT = { id: 'uuid-pat', displayName: 'Pat', avatar: 'fox' };
const SAM = { id: 'uuid-sam', displayName: 'Sam', avatar: null };

const graph = (over: Partial<Parameters<typeof Object.assign>[0]> = {}) => ({
    friends: [], incoming: [], outgoing: [], blocked: [], code: 'ABC23XYZ', ...over,
});

beforeEach(() => {
    fetchFriends.mockReset().mockResolvedValue(graph());
    addFriendByCode.mockReset();
    updateFriendship.mockReset().mockResolvedValue(true);
    removeFriend.mockReset().mockResolvedValue(true);
});

afterEach(cleanup);

describe('the account\'s own code', () => {
    it('is shown, because a code nobody can see is a code nobody can share', async () => {
        render(<FriendsPanel />);
        expect(await screen.findByLabelText('Your friend code: ABC23XYZ')).toBeTruthy();
    });

    it('can be copied', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        render(<FriendsPanel />);

        fireEvent.click(await screen.findByRole('button', { name: 'Copy your friend code to clipboard' }));

        await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABC23XYZ'));
    });
});

describe('an outage', () => {
    /*
     * The distinction this panel exists to keep: null from the API is "we
     * cannot tell", and rendering it as an empty list would tell somebody they
     * have no friends when the truth is the server is down.
     */
    it('says so rather than drawing an empty graph', async () => {
        fetchFriends.mockResolvedValue(null);
        render(<FriendsPanel />);

        expect(await screen.findByText(/unavailable right now/i)).toBeTruthy();
        expect(screen.queryByText(/Nobody yet/)).toBeNull();
    });
});

describe('adding by code', () => {
    it('sends what was typed and reports the answer', async () => {
        addFriendByCode.mockResolvedValue({ ok: true, message: 'Request sent.' });
        render(<FriendsPanel />);

        fireEvent.change(await screen.findByLabelText('Friend code to add'), { target: { value: 'abc23xyz' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        await waitFor(() => expect(addFriendByCode).toHaveBeenCalledWith('abc23xyz'));
        expect(await screen.findByText('Request sent.')).toBeTruthy();
    });

    /*
     * A refusal is an ANSWER, not a failure — and it must not look like one
     * either. Re-fetching on a refused code would redraw the same graph and
     * make a typo look like it did something.
     */
    it('shows a refusal without reloading the graph', async () => {
        addFriendByCode.mockResolvedValue({ ok: false, message: 'No account with that code' });
        render(<FriendsPanel />);
        await screen.findByLabelText('Friend code to add');
        expect(fetchFriends).toHaveBeenCalledTimes(1);

        fireEvent.change(screen.getByLabelText('Friend code to add'), { target: { value: 'ZZZZZZZZ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        expect(await screen.findByText('No account with that code')).toBeTruthy();
        expect(fetchFriends).toHaveBeenCalledTimes(1);
    });

    it('keeps a refused code in the box to be corrected', async () => {
        addFriendByCode.mockResolvedValue({ ok: false, message: 'No account with that code' });
        render(<FriendsPanel />);

        const input = (await screen.findByLabelText('Friend code to add')) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'ZZZZZZZZ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add' }));

        await screen.findByText('No account with that code');
        expect(input.value).toBe('ZZZZZZZZ');
    });
});

describe('requests waiting on me', () => {
    beforeEach(() => fetchFriends.mockResolvedValue(graph({ incoming: [PAT] })));

    // Three Accept buttons in a list are indistinguishable without the name.
    it('names who each button acts on', async () => {
        render(<FriendsPanel />);
        expect(await screen.findByRole('button', { name: 'Accept Pat' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Decline Pat' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Block Pat' })).toBeTruthy();
    });

    it.each([
        ['Accept Pat', 'accept'],
        ['Decline Pat', 'decline'],
        ['Block Pat', 'block'],
    ])('%s sends the %s action', async (button, action) => {
        render(<FriendsPanel />);
        fireEvent.click(await screen.findByRole('button', { name: button }));
        await waitFor(() => expect(updateFriendship).toHaveBeenCalledWith(PAT.id, action));
    });

    it('reloads the graph once something moves', async () => {
        render(<FriendsPanel />);
        fireEvent.click(await screen.findByRole('button', { name: 'Accept Pat' }));
        await waitFor(() => expect(fetchFriends).toHaveBeenCalledTimes(2));
    });
});

describe('the lists', () => {
    it('separates friends, requests and sent requests', async () => {
        fetchFriends.mockResolvedValue(graph({ friends: [PAT], incoming: [SAM], outgoing: [] }));
        render(<FriendsPanel />);

        expect(await screen.findByRole('button', { name: 'Remove Pat' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Accept Sam' })).toBeTruthy();
        expect(screen.queryByRole('region', { name: 'Sent' })).toBeNull();
    });

    it('offers to cancel a request I sent, not to accept it', async () => {
        fetchFriends.mockResolvedValue(graph({ outgoing: [SAM] }));
        render(<FriendsPanel />);

        expect(await screen.findByRole('button', { name: 'Cancel your request to Sam' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Accept Sam' })).toBeNull();
    });

    /*
     * The blocker's way back. Blocking is the only edge you cannot undo
     * without seeing it — off the list, the other person's code simply stops
     * working with nothing on screen to explain it.
     */
    it('lists people I blocked so the block can be lifted', async () => {
        fetchFriends.mockResolvedValue(graph({ blocked: [SAM] }));
        render(<FriendsPanel />);

        fireEvent.click(await screen.findByRole('button', { name: 'Unblock Sam' }));

        await waitFor(() => expect(removeFriend).toHaveBeenCalledWith(SAM.id));
    });

    it('says the graph is empty when it really is', async () => {
        render(<FriendsPanel />);
        expect(await screen.findByText(/Nobody yet/)).toBeTruthy();
    });
});
