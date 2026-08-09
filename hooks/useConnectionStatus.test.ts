// @vitest-environment jsdom

/**
 * The connection slice's one feeder. The status drives the only UI that can
 * report the server being gone, and the deliberate-disconnect branch also
 * guards `joinPending`: a route change discards the socket's send buffer, so a
 * join emit waiting in it is dead and the flag must not outlive it — left set,
 * Landing showed "Joining room…" forever for a request nothing carried.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { useConnectionStatus } from './useConnectionStatus';
import type { AppSocket } from '@/lib/initSocket';

/** A socket whose lifecycle listeners can be fired on demand. */
const fakeSocket = () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
        id: 'sock-1',
        on: (event: string, fn: (...args: unknown[]) => void) => {
            (listeners[event] ||= []).push(fn);
        },
        off: (event: string, fn: (...args: unknown[]) => void) => {
            listeners[event] = (listeners[event] || []).filter((f) => f !== fn);
        },
        fire: (event: string, ...args: unknown[]) =>
            (listeners[event] || []).forEach((fn) => fn(...args)),
        listenerCount: (event: string) => (listeners[event] || []).length,
    };
};

const state = () => useMinesweeperStore.getState();

const mount = () => {
    const socket = fakeSocket();
    renderHook(() => useConnectionStatus(socket as unknown as AppSocket));
    return socket;
};

beforeEach(() => {
    state().setConnectionStatus('connecting');
    state().setJoinPending(null);
});

describe('status transitions', () => {
    test('connect reports connected', () => {
        const socket = mount();
        socket.fire('connect');
        expect(state().connectionStatus).toBe('connected');
    });

    test('a network drop reports reconnecting', () => {
        const socket = mount();
        socket.fire('connect');
        socket.fire('disconnect', 'transport close');
        expect(state().connectionStatus).toBe('reconnecting');
    });

    test('a failed first dial reports unreachable', () => {
        const socket = mount();
        socket.fire('connect_error', new Error('refused'));
        expect(state().connectionStatus).toBe('unreachable');
    });

    test('a failed retry after a drop stays reconnecting, not unreachable', () => {
        const socket = mount();
        socket.fire('connect');
        socket.fire('disconnect', 'transport close');
        socket.fire('connect_error', new Error('refused'));
        expect(state().connectionStatus).toBe('reconnecting');
    });
});

describe('a deliberate disconnect (route change)', () => {
    test('resets to connecting rather than reporting a reconnect', () => {
        const socket = mount();
        socket.fire('connect');
        socket.fire('disconnect', 'io client disconnect');
        expect(state().connectionStatus).toBe('connecting');
    });

    test('kills a pending join, whose buffered emit died with the socket', () => {
        state().setJoinPending('join');
        const socket = mount();
        socket.fire('connect');
        socket.fire('disconnect', 'io client disconnect');
        expect(state().joinPending).toBeNull();
    });

    test('a network drop keeps the pending join — socket.io flushes the buffer on reconnect', () => {
        state().setJoinPending('join');
        const socket = mount();
        socket.fire('connect');
        socket.fire('disconnect', 'transport close');
        expect(state().joinPending).toBe('join');
    });
});

describe('the listeners themselves', () => {
    test('are removed on unmount', () => {
        const socket = fakeSocket();
        const { unmount } = renderHook(() =>
            useConnectionStatus(socket as unknown as AppSocket));

        expect(socket.listenerCount('connect')).toBe(1);
        expect(socket.listenerCount('disconnect')).toBe(1);
        expect(socket.listenerCount('connect_error')).toBe(1);
        unmount();
        expect(socket.listenerCount('connect')).toBe(0);
        expect(socket.listenerCount('disconnect')).toBe(0);
        expect(socket.listenerCount('connect_error')).toBe(0);
    });

    test('no socket yet is not an error', () => {
        expect(() => renderHook(() => useConnectionStatus(null))).not.toThrow();
    });
});
