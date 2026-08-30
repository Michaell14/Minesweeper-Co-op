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
 * The whole client half of the socket protocol, wired once.
 *
 * Every route that talks to the server calls this — currently `/` and `/daily`.
 * The order matters and is the reason this is one hook rather than five lines
 * copied twice: `useSocketEvents` connects the socket only after the handler
 * table is attached, and the table comes from `useGameEvents`, which needs the
 * emits from `useGameActions`.
 *
 * Each route gets its OWN socket, and navigating between them redials. That is
 * fine, and deliberate rather than tolerated: `/daily` is not a room (see
 * ARCHITECTURE.md §5) — an attempt is addressed by a localStorage token and is
 * built to survive a reconnect, which is the same path a reload already takes.
 * Hoisting the socket into a shared layout to avoid the redial would buy nothing
 * and couple the two routes' lifetimes together.
 *
 * `useMatchReconnect` is included everywhere because it reads `matchSearching`
 * and does nothing unless a quick-match search is actually running.
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
