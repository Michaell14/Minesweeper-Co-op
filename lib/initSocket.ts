import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/shared/socketPayloads";
import { getBridgeToken } from "@/lib/authBridge";

/**
 * The socket, carrying the protocol: emits and the `hooks/useGameEvents.ts`
 * handlers are checked against `shared/socketPayloads.ts`. Use this alias, not
 * a bare `Socket`, which accepts anything.
 */
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Backend URL. NEXT_PUBLIC_SOCKET_URL overrides it, inlined at build time (a
 * change needs a Vercel rebuild). Exported for lib/profileApi.ts.
 */
export const serverURL =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (process.env.NODE_ENV === "development"
        ? "http://localhost:3001"
        : "https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com"); // no trailing slash

/**
 * Creates the client socket; connection is deferred to hooks/useSocketEvents.
 * The handshake carries `sessionId` (lib/session.ts) and `authToken`
 * (lib/authBridge.ts). `auth` is a function so BOTH are re-read on every
 * (re)connect; an object would present a long-expired token days later. A
 * missing token is sent as "" (anonymous); OAuth sign-in is a full-page
 * redirect, so the socket reconnects fresh with the new token.
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
