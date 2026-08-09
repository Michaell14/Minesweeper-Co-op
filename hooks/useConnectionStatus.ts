"use client";

import { useEffect } from "react";
import { useMinesweeperStore } from "@/app/store";
import type { AppSocket } from "@/lib/initSocket";

/**
 * Feeds connectionSlice from the socket's lifecycle events.
 *
 * These are socket.io's RESERVED events, not protocol events, so they cannot go
 * through the `useSocketEvents` table — its keys are typed to
 * `ServerToClientEvents` on purpose. Registered directly instead, the same way
 * `useMatchReconnect` listens for `connect`.
 *
 * `connect_error` only downgrades to 'unreachable' when nothing has ever got
 * through: after a mid-game drop the same event fires per failed retry, but the
 * user's situation is still "reconnecting" — socket.io keeps redialling either
 * way (`reconnection: true`), so neither state is a dead end.
 */
export function useConnectionStatus(socket: AppSocket | null): void {
    useEffect(() => {
        if (!socket) return;

        const onConnect = () =>
            useMinesweeperStore.getState().setConnectionStatus("connected");

        const onDisconnect = (reason: string) => {
            const store = useMinesweeperStore.getState();
            if (reason === "io client disconnect") {
                // The client hanging up on purpose — navigating between `/` and
                // `/daily` redials (see useGameSession). Not a drop; reset for
                // the next route's socket rather than reporting a reconnect.
                store.setConnectionStatus("connecting");
                // A deliberate disconnect discards the socket's send buffer, so
                // a join/create emit waiting in it is dead — the flag must not
                // outlive the request. A network drop keeps the buffer (socket.io
                // flushes it on reconnect), so pending rightly survives below.
                store.setJoinPending(null);
                return;
            }
            store.setConnectionStatus("reconnecting");
        };

        const onConnectError = () => {
            const store = useMinesweeperStore.getState();
            if (store.connectionStatus === "connecting" || store.connectionStatus === "unreachable") {
                store.setConnectionStatus("unreachable");
            }
        };

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("connect_error", onConnectError);
        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
            socket.off("connect_error", onConnectError);
        };
    }, [socket]);
}
