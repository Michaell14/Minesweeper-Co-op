// @vitest-environment jsdom

/**
 * Getting back in the queue after the socket redials. The queue is keyed by
 * socket id and cleaned up on `disconnect`, so a dropped connection removed
 * the entry, and the client kept "searching" forever with nothing to pair.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { useMatchReconnect } from './useMatchReconnect';
import type { AppSocket } from '@/lib/initSocket';

/** A socket whose `connect` listeners can be fired on demand. */
const fakeSocket = () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
        id: 'sock-1',
        on: (event: string, fn: () => void) => {
            (listeners[event] ||= []).push(fn);
        },
        off: (event: string, fn: () => void) => {
            listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
        },
        emit: vi.fn(),
        reconnect: () => (listeners.connect || []).forEach((fn) => fn()),
        listenerCount: (event: string) => (listeners[event] || []).length,
    };
};

const state = () => useMinesweeperStore.getState();

beforeEach(() => {
    state().setMatchSearching(false);
    state().setPlayerJoined(false);
    state().setName('Alice');
});

describe('when the socket comes back', () => {
    test('a player who is still searching is queued again', () => {
        state().setMatchSearching(true);
        const socket = fakeSocket();
        const findMatch = vi.fn();
        renderHook(() => useMatchReconnect(socket as unknown as AppSocket, findMatch));

        socket.reconnect();

        expect(findMatch).toHaveBeenCalledTimes(1);
    });

    test('a player who is not searching is left alone', () => {
        const socket = fakeSocket();
        const findMatch = vi.fn();
        renderHook(() => useMatchReconnect(socket as unknown as AppSocket, findMatch));

        // The first connect of a session lands here too.
        socket.reconnect();

        expect(findMatch).not.toHaveBeenCalled();
    });

    test('a player already in a room is never dragged back into the queue', () => {
        // The server refuses a socket with a player record; asking would put a matchError over a live game.
        state().setMatchSearching(true);
        state().setPlayerJoined(true);
        const socket = fakeSocket();
        const findMatch = vi.fn();
        renderHook(() => useMatchReconnect(socket as unknown as AppSocket, findMatch));

        socket.reconnect();

        expect(findMatch).not.toHaveBeenCalled();
    });

    test('a search with no name behind it is not resumed', () => {
        state().setMatchSearching(true);
        state().setName('');
        const socket = fakeSocket();
        const findMatch = vi.fn();
        renderHook(() => useMatchReconnect(socket as unknown as AppSocket, findMatch));

        socket.reconnect();

        expect(findMatch).not.toHaveBeenCalled();
    });
});

describe('the listener itself', () => {
    test('is removed on unmount, so a remounted page cannot queue twice', () => {
        const socket = fakeSocket();
        const { unmount } = renderHook(() =>
            useMatchReconnect(socket as unknown as AppSocket, vi.fn()));

        expect(socket.listenerCount('connect')).toBe(1);
        unmount();
        expect(socket.listenerCount('connect')).toBe(0);
    });

    test('no socket yet is not an error', () => {
        expect(() => renderHook(() => useMatchReconnect(null, vi.fn()))).not.toThrow();
    });
});
