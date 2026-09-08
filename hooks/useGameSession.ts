"use client";

import { useSocket } from "@/hooks/useSocket";
import { useSocketEvents } from "@/hooks/useSocketEvents";
import { useGameActions } from "@/hooks/useGameActions";
import { useGameEvents } from "@/hooks/useGameEvents";
import { useMatchReconnect } from "@/hooks/useMatchReconnect";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { useRoomHistory } from "@/hooks/useRoomHistory";
import type { AppSocket } from "@/lib/initSocket";

/**
 * The whole client half of the socket protocol, wired once, by every route
 * that talks to the server. One hook because the order matters:
 * `useSocketEvents` connects only after the handler table from
 * `useGameEvents` is attached, which needs `useGameActions`'s emits.
 *
 * Each route gets its OWN socket and navigating redials; `/daily` is not a
 * room (ARCHITECTURE.md §5) and an attempt survives a reconnect anyway.
 * `useMatchReconnect` does nothing unless a quick-match search is running.
 */
export function useGameSession(): {
    socket: AppSocket | null;
    actions: ReturnType<typeof useGameActions>;
} {
    const socket = useSocket();
    const actions = useGameActions(socket);
    useSocketEvents(socket, useGameEvents(socket, actions.leaveRoom));
    useMatchReconnect(socket, actions.findMatch);
    // Back leaves the ROOM, not the site. Reads playerJoined, so inert on /daily.
    useRoomHistory(actions.leaveRoom);
    useConnectionStatus(socket);

    return { socket, actions };
}
