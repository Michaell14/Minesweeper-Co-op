/**
 * Per-tab session id, so the server recognises a reconnecting player.
 * sessionStorage, not localStorage: a second tab presenting the same id would
 * read as a reconnect and evict the first tab. Per-tab still survives a reload.
 */
const STORAGE_KEY = "minesweeper_session_id";

/**
 * Must be unguessable: whoever presents an id takes that session's seat.
 * `crypto.randomUUID` needs a secure context (absent over plain HTTP on a LAN);
 * `getRandomValues` has no such gate, so the Math.random branch is reachable
 * only where there is no Web Crypto at all.
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
