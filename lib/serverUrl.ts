/**
 * Backend URL. NEXT_PUBLIC_SOCKET_URL overrides it, inlined at build time (a
 * change needs a Vercel rebuild).
 *
 * Its own module, deliberately free of imports: the REST clients
 * (`lib/*Api.ts`) run on every route through the layout, and reading this from
 * `lib/initSocket.ts` put the whole socket.io client on pages that never open
 * a socket. Only the game routes should pay for that.
 */
export const serverURL =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (process.env.NODE_ENV === "development"
        ? "http://localhost:3001"
        : "https://nameless-coast-33840-33c3fd45fe2d.herokuapp.com"); // no trailing slash
