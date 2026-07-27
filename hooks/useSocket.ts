"use client";

import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import { initSocket } from "@/lib/initSocket";

/**
 * Creates the socket for this session and disconnects it on unmount.
 *
 * The socket is created but NOT connected here: `useSocketEvents` connects it
 * after listeners are attached, matching the original ordering.
 */
export function useSocket(): Socket | null {
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const newSocket = initSocket();
        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    return socket;
}
