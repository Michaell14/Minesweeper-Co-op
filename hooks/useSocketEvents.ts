"use client";

import { useEffect, useRef } from "react";
import type { AppSocket } from "@/lib/initSocket";
import type { ServerToClientEvents } from "@/shared/socketPayloads";

/**
 * A table of listeners, keyed by event name and typed by the protocol, so an
 * unknown key or a mistyped payload is a compile error.
 */
export type SocketHandlers = { [E in keyof ServerToClientEvents]?: ServerToClientEvents[E] };

/**
 * Registers a table of socket listeners and tears down exactly what it added.
 *
 * Teardown is derived from what was registered rather than hand-maintained, and
 * unregisters the specific handler — `socket.off(event)` with no handler would
 * remove other components' listeners too.
 *
 * Each event is registered ONCE with a stable wrapper that forwards to the
 * latest handler through a ref, so handlers are always current, nothing
 * re-subscribes on re-render, and a stale closure is impossible.
 *
 * The set of event NAMES is assumed stable for a given socket; only the function
 * bodies may change between renders.
 */
export function useSocketEvents(socket: AppSocket | null, handlers: SocketHandlers): void {
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    // Re-register only if the socket or the set of event names changes.
    const eventNames = Object.keys(handlers).sort().join("|");

    useEffect(() => {
        if (!socket) return;

        // Registration is by name at runtime, so types are erased here and
        // restored at the boundary. Every caller-facing surface stays typed.
        const registered = (eventNames.split("|") as (keyof ServerToClientEvents)[]).map((event) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const listener = (...args: any[]) => (handlersRef.current[event] as any)?.(...args);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.on(event as any, listener);
            return { event, listener };
        });

        // Connect only after listeners are attached, so nothing can arrive
        // before there is something to receive it.
        socket.connect();

        return () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            registered.forEach(({ event, listener }) => socket.off(event as any, listener));
        };
    }, [socket, eventNames]);
}
