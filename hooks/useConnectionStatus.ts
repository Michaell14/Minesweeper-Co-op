"use client";

import { useEffect } from "react";
import { useMinesweeperStore } from "@/app/store";
import type { AppSocket } from "@/lib/initSocket";

/**
 * Feeds connectionSlice from the socket's lifecycle events. These are
 * socket.io's RESERVED events, so they cannot go through the `useSocketEvents`
 * table (typed to `ServerToClientEvents`); registered directly, like
 * `useMatchReconnect`. `connect_error` only downgrades to 'unreachable' when
 * nothing has ever got through; after a mid-game drop it is still "reconnecting".
 */
export function useConnectionStatus(socket: AppSocket | null): void {
    useEffect(() => {
        if (!socket) return;

        const onConnect = () =>
            useMinesweeperStore.getState().setConnectionStatus("connected");

        const onDisconnect = (reason: string) => {
            const store = useMinesweeperStore.getState();
            if (reason === "io client disconnect") {
                // The client hanging up on purpose (navigating between `/` and
                // `/daily` redials). Not a drop; reset for the next socket.
                store.setConnectionStatus("connecting");
                // A deliberate disconnect discards the send buffer, so a pending
                // join/create is dead. A network drop keeps it, so pending survives below.
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
