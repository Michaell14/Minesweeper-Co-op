"use client";

import { useEffect, useRef } from "react";
import { Socket } from "socket.io-client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SocketHandlers = Record<string, (...args: any[]) => void>;

/**
 * Registers a table of socket listeners and tears down exactly what it added.
 *
 * Two problems this solves, both of which used to live in page.tsx:
 *
 * 1. Cleanup was a hand-maintained list of 27 `socket.off(event)` calls that had
 *    to be kept in sync with 27 `socket.on(...)` calls by eye. Here the teardown
 *    is derived from what was registered, so it cannot drift. It also unregisters
 *    the specific handler rather than every listener for that event name --
 *    `socket.off(event)` with no handler removes other components' listeners too.
 *
 * 2. The effect needed every handler dependency in its array (it had 26 entries),
 *    and a missing one meant a stale closure. Each event is registered ONCE with
 *    a stable wrapper that forwards to the latest handler through a ref, so
 *    handlers are always current and nothing re-subscribes on re-render.
 *
 * The set of event NAMES is assumed stable for a given socket; only the function
 * bodies are allowed to change between renders.
 */
export function useSocketEvents(socket: Socket | null, handlers: SocketHandlers): void {
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    // Re-register only if the socket or the set of event names changes.
    const eventNames = Object.keys(handlers).sort().join("|");

    useEffect(() => {
        if (!socket) return;

        const registered = eventNames.split("|").map((event) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const listener = (...args: any[]) => handlersRef.current[event]?.(...args);
            socket.on(event, listener);
            return { event, listener };
        });

        // Connect only after listeners are attached, so nothing can arrive
        // before there is something to receive it.
        socket.connect();

        return () => {
            registered.forEach(({ event, listener }) => socket.off(event, listener));
        };
    }, [socket, eventNames]);
}
