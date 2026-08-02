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
 * Backend URL. NEXT_PUBLIC_SOCKET_URL overrides it, and is inlined at build
 * time, so changing it needs a Vercel rebuild.
 */
const serverURL =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (process.env.NODE_ENV === "development"
        ? "http://localhost:3001"
        : "https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com"); // no trailing slash

/**
 * Creates the client socket. Connection is deferred to hooks/useSocketEvents.
 *
 * The server reads `sessionId` off the handshake to recognise a reconnecting
 * player rather than a newcomer. See lib/session.ts.
 */
export function initSocket(sessionId?: string): AppSocket {
    return io(serverURL, {
        reconnection: true,
        autoConnect: false,
        auth: { sessionId: sessionId || "" },
    });
}
