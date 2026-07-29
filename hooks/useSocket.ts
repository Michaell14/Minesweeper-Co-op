"use client";

import { useEffect, useState } from "react";
import { initSocket, type AppSocket } from "@/lib/initSocket";
import { getOrCreateSessionId } from "@/lib/session";

/**
 * Creates the socket for this session and disconnects it on unmount.
 *
 * The socket is created but NOT connected here: `useSocketEvents` connects it
 * after listeners are attached, matching the original ordering.
 */
export function useSocket(): AppSocket | null {
    const [socket, setSocket] = useState<AppSocket | null>(null);

    useEffect(() => {
        // Persistent per-browser id, so a reload reconnects rather than
        // arriving as a new player.
        const newSocket = initSocket(getOrCreateSessionId());
        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    return socket;
}
