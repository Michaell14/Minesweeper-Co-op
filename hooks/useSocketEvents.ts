"use client";

import { useEffect, useRef } from "react";
import type { AppSocket } from "@/lib/initSocket";
import type { ServerToClientEvents } from "@/shared/socketPayloads";

/** Listeners keyed by event name and typed by the protocol: a bad key or payload fails to compile. */
export type SocketHandlers = { [E in keyof ServerToClientEvents]?: ServerToClientEvents[E] };

/**
 * Registers a table of socket listeners and tears down exactly what it added
 * (`socket.off(event)` with no handler would remove other components'
 * listeners). Each event is registered ONCE with a stable wrapper forwarding
 * to the latest handler through a ref, so nothing re-subscribes on re-render
 * and a stale closure is impossible. The set of event NAMES is assumed stable
 * for a given socket.
 */
export function useSocketEvents(socket: AppSocket | null, handlers: SocketHandlers): void {
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    // Re-register only if the socket or the set of event names changes.
    const eventNames = Object.keys(handlers).sort().join("|");

    useEffect(() => {
        if (!socket) return;

        // Registration is by name at runtime, so types are erased here and restored at the boundary.
        const registered = (eventNames.split("|") as (keyof ServerToClientEvents)[]).map((event) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const listener = (...args: any[]) => (handlersRef.current[event] as any)?.(...args);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            socket.on(event as any, listener);
            return { event, listener };
        });

        // Connect only after listeners are attached, so nothing arrives unheard.
        socket.connect();

        return () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            registered.forEach(({ event, listener }) => socket.off(event as any, listener));
        };
    }, [socket, eventNames]);
}
