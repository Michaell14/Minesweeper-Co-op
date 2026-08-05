/**
 * Per-tab session id, used by the server to recognise a reconnecting player
 * rather than treating them as someone new.
 *
 * sessionStorage, not localStorage: localStorage is shared by every tab, so a
 * second tab would present the same id and the server would read it as "that
 * player reconnected on a new socket", evicting the first tab from its room and
 * handing over the host role. sessionStorage is per-tab and still survives a
 * reload, which is the case this exists for.
 */
const STORAGE_KEY = "minesweeper_session_id";

/**
 * The id has to be unguessable, because it is the only thing identifying a
 * returning player: whoever presents one is offered that session's room and
 * name, and takes its seat.
 *
 * `crypto.randomUUID` is gated on a SECURE CONTEXT, so it is simply absent over
 * plain HTTP — a LAN address during development, say. The fallback there used to
 * be `Math.random()` plus the clock, which is neither cryptographic nor
 * unpredictable: `Date.now()` is public and `Math.random()` is not a CSPRNG, so
 * ids minted on that path were guessable from roughly when the tab opened.
 *
 * `getRandomValues` carries no such gate, so the genuinely weak branch is now
 * only reachable where there is no Web Crypto at all.
 */
const randomId = (): string => {
    if (typeof crypto !== "undefined") {
        if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
        if (typeof crypto.getRandomValues === "function") {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        }
    }
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

export function getOrCreateSessionId(): string {
    if (typeof window === "undefined") return "";

    let sessionId = sessionStorage.getItem(STORAGE_KEY) || "";
    if (!sessionId) {
        sessionId = randomId();
        sessionStorage.setItem(STORAGE_KEY, sessionId);
    }
    return sessionId;
}
