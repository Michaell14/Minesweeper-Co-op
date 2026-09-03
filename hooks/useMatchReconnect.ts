"use client";

import { useEffect } from "react";
import { useMinesweeperStore } from "@/app/store";
import type { AppSocket } from "@/lib/initSocket";

/**
 * Puts a searching player back in the queue after the socket redials. The
 * queue is keyed by socket id and cleaned up on `disconnect`, so after a
 * reconnect nothing re-queued and the player watched "Looking for an
 * opponent" with no record server-side. `connect` also fires on the FIRST
 * connection and after a reload, where nothing is searching; reading the
 * flag rather than counting connections covers both.
 */
export function useMatchReconnect(socket: AppSocket | null, findMatch: () => void): void {
    useEffect(() => {
        if (!socket) return;

        const requeue = () => {
            const { matchSearching, playerJoined, name } = useMinesweeperStore.getState();
            // A room outranks a stale flag: the server refuses to queue a socket that has a player record.
            if (!matchSearching || playerJoined || !name) return;
            findMatch();
        };

        socket.on("connect", requeue);
        return () => {
            socket.off("connect", requeue);
        };
    }, [socket, findMatch]);
}
