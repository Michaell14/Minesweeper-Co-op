import { io, Socket } from "socket.io-client";

/**
 * Backend URL. Hardcoded per NODE_ENV rather than configured, which means
 * pointing at a different backend requires a code change. See ARCHITECTURE.md.
 */
const serverURL = process.env.NODE_ENV === "development"
    ? "http://localhost:3001" // Development URL
    : "https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com"; // Production URL (no trailing slash)

/** Creates the client socket. Connection is deferred to hooks/useSocketEvents. */
export function initSocket(): Socket {
    return io(serverURL, {
        reconnection: true,
        autoConnect: false,
    });
}
