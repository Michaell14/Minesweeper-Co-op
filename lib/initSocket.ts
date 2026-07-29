import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/shared/socketPayloads";

/**
 * The socket, carrying the protocol with it.
 *
 * Typing it here is what makes `socket.emit(...)` and every handler in
 * `hooks/useGameEvents.ts` checked against `shared/socketPayloads.ts`. Use this
 * alias rather than a bare `Socket`, which accepts any event with any payload.
 */
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

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

/**
 * Creates the client socket. Connection is deferred to hooks/useSocketEvents.
 *
 * `sessionId` is the browser's persistent id; the server reads it from the
 * handshake to recognise a reconnecting player rather than treating them as a
 * newcomer. See lib/session.ts and server/data/sessionRepo.js.
 */
export function initSocket(sessionId?: string): AppSocket {
    return io(serverURL, {
        reconnection: true,
        autoConnect: false,
        auth: { sessionId: sessionId || "" },
    });
}
