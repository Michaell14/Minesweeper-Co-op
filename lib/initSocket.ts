import { io, Socket } from "socket.io-client";

/**
 * Backend URL.
 *
 * Set NEXT_PUBLIC_SOCKET_URL to point at a different backend (it is inlined at
 * build time, so a Vercel rebuild is needed after changing it). Without it the
 * previous hardcoded defaults apply, so existing deploys are unaffected.
 */
const serverURL =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (process.env.NODE_ENV === "development"
        ? "http://localhost:3001" // Development default
        : "https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com"); // Production default (no trailing slash)

/** Creates the client socket. Connection is deferred to hooks/useSocketEvents. */
export function initSocket(): Socket {
    return io(serverURL, {
        reconnection: true,
        autoConnect: false,
    });
}
