"use client";

import { useEffect } from "react";
import { useMinesweeperStore } from "@/app/store";
import type { AppSocket } from "@/lib/initSocket";

/**
 * Puts a searching player back in the queue after the socket redials.
 *
 * The queue is keyed by socket id and cleaned up on `disconnect`, so a dropped
 * connection removes the entry — correctly, since nobody should be paired with
 * a socket that has gone. What was missing is the other half: socket.io then
 * reconnects and nothing re-queues. The player sat watching "Looking for an
 * opponent" while the server had no record of them, and no amount of waiting
 * could ever produce a match.
 *
 * Invisible from either side. The client had asked and been told it was
 * searching; the server had simply been told the socket left.
 *
 * `connect` also fires for the FIRST connection, where nothing is searching —
 * and after a reload, where the store is fresh and the dialog is gone, so the
 * search really is over and must not resume behind the player's back. Both fall
 * out of reading the flag rather than counting connections.
 */
export function useMatchReconnect(socket: AppSocket | null, findMatch: () => void): void {
    useEffect(() => {
        if (!socket) return;

        const requeue = () => {
            const { matchSearching, playerJoined, name } = useMinesweeperStore.getState();
            // Being in a room outranks a stale flag: the server refuses to
            // queue a socket that already has a player record, so asking would
            // only earn a `matchError` over the top of a live game.
            if (!matchSearching || playerJoined || !name) return;
            findMatch();
        };

        socket.on("connect", requeue);
        return () => {
            socket.off("connect", requeue);
        };
    }, [socket, findMatch]);
}
