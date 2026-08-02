import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/shared/socketPayloads";
import { getBridgeToken } from "@/lib/authBridge";

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
 * time, so changing it needs a Vercel rebuild. Exported for lib/profileApi.ts,
 * which speaks HTTP to the same backend.
 */
export const serverURL =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (process.env.NODE_ENV === "development"
        ? "http://localhost:3001"
        : "https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com"); // no trailing slash

/**
 * Creates the client socket. Connection is deferred to hooks/useSocketEvents.
 *
 * The server reads two things off the handshake: `sessionId`, to recognise a
 * reconnecting player rather than a newcomer (lib/session.ts), and
 * `authToken`, the bridge token that ties the socket to an account
 * (lib/authBridge.ts). `auth` is a function so BOTH are re-read on every
 * (re)connect attempt — an object would freeze the token minted before the
 * first connect and present it, long expired, on a reconnect days later.
 *
 * A missing token is sent as "" and the server treats the player as
 * anonymous; OAuth sign-in is a full-page redirect, so the socket always
 * reconnects fresh afterwards and picks the new token up here.
 */
export function initSocket(sessionId?: string): AppSocket {
    return io(serverURL, {
        reconnection: true,
        autoConnect: false,
        auth: (cb) => {
            getBridgeToken()
                .then((token) => cb({ sessionId: sessionId || "", authToken: token || "" }))
                .catch(() => cb({ sessionId: sessionId || "", authToken: "" }));
        },
    });
}
