"use client";

import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { initSocket } from "@/lib/initSocket";
import { getOrCreateSessionId } from "@/lib/session";

/**
 * Creates the socket for this session and disconnects it on unmount.
 *
 * The socket is created but NOT connected here: `useSocketEvents` connects it
 * after listeners are attached, matching the original ordering.
 */
export function useSocket(): Socket | null {
    const [socket, setSocket] = useState<Socket | null>(null);

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
