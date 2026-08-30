// @vitest-environment jsdom

/**
 * The browser Back button, mid-game.
 *
 * The game is store state on `/` — joining a room changes no URL and pushed no
 * history entry, so Back left the SITE from the middle of a game rather than
 * returning to the landing page. Nothing on screen suggested that is what it
 * would do.
 *
 * jsdom implements history and popstate well enough for the wiring, which is
 * what this file covers: that an entry is pushed on the way in, and that a pop
 * leaves the room instead of the site. Whether real Chrome's Back actually
 * lands back on the landing form is a browser question, and lives in the smoke
 * suite.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { useRoomHistory, ROOM_HISTORY_MARKER } from './useRoomHistory';

const state = () => useMinesweeperStore.getState();

/**
 * Fires popstate the way the browser really does.
 *
 * The state handed to the listener belongs to the entry being ARRIVED AT, not
 * the one being left — so backing out of a room delivers the LANDING entry's
 * state, with no marker on it. Verified in Chrome: after history.back() from a
 * joined room, `history.state` held Next's internals and no msRoom.
 *
 * Getting this backwards is not hypothetical. The first version of this file
 * fired popstate carrying the room marker, the hook left on seeing it, and the
 * two agreed with each other while Back did nothing at all in a real browser.
 */
const pressBack = (arrivingState: unknown = null) => {
    window.dispatchEvent(new PopStateEvent('popstate', { state: arrivingState }));
};

/** The state Next leaves on an ordinary entry — no room marker. */
const NEXT_ENTRY = { __NA: true };

beforeEach(() => {
    state().setPlayerJoined(false);
    window.history.replaceState(null, '', '/');
});

describe('joining a room', () => {
    test('pushes a history entry, so Back has somewhere to go', () => {
        const push = vi.spyOn(window.history, 'pushState');
        const { rerender } = renderHook(() => useRoomHistory(vi.fn()));

        state().setPlayerJoined(true);
        rerender();

        expect(push).toHaveBeenCalled();
        expect(typeof (push.mock.calls[0][0] as Record<string, unknown>)[ROOM_HISTORY_MARKER])
            .toBe('number');
    });

    /*
     * Same URL on purpose. The room is not a route, and handing Next's router a
     * different path here would make it try to navigate.
     */
    test('leaves the URL alone', () => {
        const before = window.location.href;
        const { rerender } = renderHook(() => useRoomHistory(vi.fn()));

        state().setPlayerJoined(true);
        rerender();

        expect(window.location.href).toBe(before);
    });

    test('pushes once, not on every render', () => {
        const push = vi.spyOn(window.history, 'pushState');
        const { rerender } = renderHook(() => useRoomHistory(vi.fn()));

        state().setPlayerJoined(true);
        rerender();
        rerender();
        rerender();

        expect(push).toHaveBeenCalledTimes(1);
    });
});

describe('pressing Back in a room', () => {
    test('leaves the room', () => {
        const leaveRoom = vi.fn();
        const { rerender } = renderHook(() => useRoomHistory(leaveRoom));
        state().setPlayerJoined(true);
        rerender();

        pressBack(NEXT_ENTRY);

        expect(leaveRoom).toHaveBeenCalledTimes(1);
    });

    /*
     * Arriving back ON this room's own entry is a return, not a departure —
     * coming back from /profile lands exactly here, and leaving then would
     * throw the player out of a room they never asked to leave.
     */
    test('does not leave when arriving back on THIS room entry', () => {
        const leaveRoom = vi.fn();
        const push = vi.spyOn(window.history, 'pushState');
        const { rerender } = renderHook(() => useRoomHistory(leaveRoom));
        state().setPlayerJoined(true);
        rerender();

        // The very entry the hook just pushed, id and all.
        pressBack(push.mock.calls[0][0]);

        expect(leaveRoom).not.toHaveBeenCalled();
    });

    /*
     * The case a boolean marker could not express. Entries pile up across
     * joins, so Back out of the second room routinely lands on the FIRST room's
     * entry — which is still a departure. Read as "a room entry, so stay" the
     * button silently did nothing from the second game onwards.
     */
    test('leaves when arriving on an OLDER room entry', () => {
        const leaveRoom = vi.fn();
        const push = vi.spyOn(window.history, 'pushState');
        const { rerender } = renderHook(() => useRoomHistory(leaveRoom));

        state().setPlayerJoined(true);
        rerender();
        const firstEntry = push.mock.calls[0][0];

        // A second join, as a rejoin or a new room would produce.
        state().setPlayerJoined(false);
        rerender();
        state().setPlayerJoined(true);
        rerender();

        pressBack(firstEntry);

        expect(leaveRoom).toHaveBeenCalledTimes(1);
    });
});

describe('pressing Back when not in a room', () => {
    /*
     * The landing page's own Back must still leave the site. Firing leaveRoom
     * here would swallow the gesture and strand the player on a page they were
     * trying to leave.
     */
    test('does nothing', () => {
        const leaveRoom = vi.fn();
        renderHook(() => useRoomHistory(leaveRoom));

        pressBack(NEXT_ENTRY);

        expect(leaveRoom).not.toHaveBeenCalled();
    });
});

describe('leaving by some other route', () => {
    /*
     * The Return to Home button, a room error, a forfeit. The entry we pushed
     * is still current, and left armed it would be mistaken for a live room by
     * the next pop. Disarmed rather than popped — popping goes wherever the
     * player came FROM, which is not necessarily the landing page.
     */
    test('disarms the entry it pushed instead of navigating', () => {
        const back = vi.spyOn(window.history, 'back');
        const replace = vi.spyOn(window.history, 'replaceState');
        const push = vi.spyOn(window.history, 'pushState');
        const { rerender } = renderHook(() => useRoomHistory(vi.fn()));

        state().setPlayerJoined(true);
        rerender();
        // The browser is now sitting on the entry the hook pushed.
        window.history.replaceState(push.mock.calls[0][0], '');
        replace.mockClear();

        state().setPlayerJoined(false);
        rerender();

        expect(back).not.toHaveBeenCalled();
        expect(replace).toHaveBeenCalled();
        expect(replace.mock.calls[0][0]).not.toHaveProperty(ROOM_HISTORY_MARKER);
    });

    test('a later Back is then an ordinary one, not a room leave', () => {
        const leaveRoom = vi.fn();
        const push = vi.spyOn(window.history, 'pushState');
        const { rerender } = renderHook(() => useRoomHistory(leaveRoom));

        state().setPlayerJoined(true);
        rerender();
        window.history.replaceState(push.mock.calls[0][0], '');
        state().setPlayerJoined(false);
        rerender();
        leaveRoom.mockClear();

        pressBack(NEXT_ENTRY);

        expect(leaveRoom).not.toHaveBeenCalled();
    });
});

describe('the hook is inert off the game route', () => {
    /* /daily mounts the same session hook and never sets playerJoined. */
    test('pushes nothing while no room is joined', () => {
        const push = vi.spyOn(window.history, 'pushState');

        renderHook(() => useRoomHistory(vi.fn()));

        expect(push).not.toHaveBeenCalled();
    });
});
