// @vitest-environment jsdom

/**
 * The browser Back button, mid-game. The game is store state on `/`, so
 * joining pushed no history entry and Back left the SITE. jsdom covers the
 * wiring (an entry is pushed on the way in, a pop leaves the room); whether
 * real Chrome lands on the landing form is in the smoke suite.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { useRoomHistory, ROOM_HISTORY_MARKER } from './useRoomHistory';

const state = () => useMinesweeperStore.getState();

/**
 * Fires popstate as the browser does: the state belongs to the entry being
 * ARRIVED AT, so backing out of a room delivers the landing entry's state,
 * with no marker. The first version of this file got this backwards and
 * passed while Back did nothing in a real browser.
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
            .toBe('string');
    });

    /* Same URL: the room is not a route, and a different path would make Next's router navigate. */
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

    /* Arriving back ON this room's entry (from /profile, say) is a return, not a departure. */
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
     * Entries pile up across joins, so Back out of the second room lands on the
     * FIRST room's entry: still a departure, which a boolean marker could not say.
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

/*
 * A reload is a second document standing on the FIRST document's entry. A
 * counter reset on reload and re-issued the id the entry underneath already
 * carried, so Back did nothing. BOTH documents are loaded fresh: reloading
 * only the second lets the first inherit a counter the tests above advanced.
 */
describe('pressing Back after a reload', () => {
    /** A freshly loaded copy of the module and everything it holds state in. */
    const freshDocument = async () => {
        vi.resetModules();
        const [hook, store, renderer] = await Promise.all([
            import('./useRoomHistory'),
            import('@/app/store'),
            import('@testing-library/react'),
        ]);
        return { useRoomHistory: hook.useRoomHistory, store, renderHook: renderer.renderHook };
    };

    /** Joins a room in the given document, and reports the entry it pushed. */
    const joinIn = (doc: Awaited<ReturnType<typeof freshDocument>>, leaveRoom: () => void) => {
        const push = vi.spyOn(window.history, 'pushState');
        push.mockClear();
        const view = doc.renderHook(() => doc.useRoomHistory(leaveRoom));
        doc.store.useMinesweeperStore.getState().setPlayerJoined(true);
        view.rerender();
        return { view, entry: push.mock.calls[0][0] };
    };

    test('still leaves the room, rather than re-issuing the old entry id', async () => {
        const before = await freshDocument();
        const joined = joinIn(before, vi.fn());
        joined.view.unmount();

        const leaveRoom = vi.fn();
        joinIn(await freshDocument(), leaveRoom);

        // Back lands on the entry the document before the reload had pushed.
        pressBack(joined.entry);

        expect(leaveRoom).toHaveBeenCalledTimes(1);
    });
});

describe('pressing Back when not in a room', () => {
    /* The landing page's own Back must still leave the site. */
    test('does nothing', () => {
        const leaveRoom = vi.fn();
        renderHook(() => useRoomHistory(leaveRoom));

        pressBack(NEXT_ENTRY);

        expect(leaveRoom).not.toHaveBeenCalled();
    });
});

describe('leaving by some other route', () => {
    /*
     * Return to Home, a room error, a forfeit: the pushed entry is still
     * current and would be mistaken for a live room by the next pop. Disarmed
     * rather than popped, since popping goes wherever the player came FROM.
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
