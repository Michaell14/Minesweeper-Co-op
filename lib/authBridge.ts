/**
 * The client's cache of the auth bridge token (see app/api/socket-token).
 * In-memory only: the token is minted from the session cookie on demand, and
 * persisting it would only widen where a bearer credential lives. Signed out,
 * a short negative cache avoids repeatedly minting for an anonymous player.
 * One in-flight fetch at a time, so a reconnect and a profile call do not race
 * two mints.
 */

interface CachedToken {
    token: string;
    /** Epoch ms, from the mint route's clock. */
    expiresAt: number;
}

/** Refresh this long before expiry, so a token never dies mid-handshake. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** A normal guest response is not a transient failure. Sign-in redirects reload this module. */
const ANONYMOUS_RETRY_MS = 60 * 1000;

let cached: CachedToken | null = null;
let inFlight: Promise<string | null> | null = null;
let anonymousUntil = 0;
let generation = 0;

const fetchToken = async (startedIn: number): Promise<string | null> => {
    try {
        const res = await fetch("/api/socket-token");
        if (generation !== startedIn) return null;
        if (!res.ok) {
            if (res.status === 401) {
                cached = null;
                anonymousUntil = Date.now() + ANONYMOUS_RETRY_MS;
            }
            return null; // Retry network/server failures on the next call.
        }
        const data = (await res.json()) as CachedToken;
        if (generation !== startedIn) return null;
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
    if (Date.now() < anonymousUntil) return null;

    if (!inFlight) {
        const pending = fetchToken(generation).finally(() => {
            // A sign-out may already have started a request for the next account.
            if (inFlight === pending) inFlight = null;
        });
        inFlight = pending;
    }
    return inFlight;
}

/** Drops the cache. Call on sign-out and account deletion. */
export function clearBridgeToken(): void {
    generation++;
    cached = null;
    anonymousUntil = 0;
    inFlight = null;
}
