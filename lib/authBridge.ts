/**
 * The client's cache of the auth bridge token (see app/api/socket-token).
 * In-memory only: the token is minted from the session cookie on demand, and
 * persisting it would only widen where a bearer credential lives. Signed out,
 * every fetch answers null and the game runs anonymous. One in-flight fetch
 * at a time, so a reconnect and a profile call do not race two mints.
 */

interface CachedToken {
    token: string;
    /** Epoch ms, from the mint route's clock. */
    expiresAt: number;
}

/** Refresh this long before expiry, so a token never dies mid-handshake. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

let cached: CachedToken | null = null;
let inFlight: Promise<string | null> | null = null;

const fetchToken = async (): Promise<string | null> => {
    try {
        const res = await fetch("/api/socket-token");
        if (!res.ok) return null; // 401 signed out, 503 bridge unconfigured
        const data = (await res.json()) as CachedToken;
        if (typeof data?.token !== "string" || typeof data?.expiresAt !== "number") return null;
        cached = data;
        return data.token;
    } catch {
        return null; // network failure — anonymous beats blocked
    }
};

/** The current bridge token, or null when the player is anonymous. */
export async function getBridgeToken(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    if (cached && Date.now() < cached.expiresAt - REFRESH_MARGIN_MS) return cached.token;

    if (!inFlight) {
        inFlight = fetchToken().finally(() => {
            inFlight = null;
        });
    }
    return inFlight;
}

/** Drops the cache. Call on sign-out and account deletion. */
export function clearBridgeToken(): void {
    cached = null;
}
