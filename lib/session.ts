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

export function getOrCreateSessionId(): string {
    if (typeof window === "undefined") return "";

    let sessionId = sessionStorage.getItem(STORAGE_KEY) || "";
    if (!sessionId) {
        sessionId =
            typeof crypto !== "undefined" && crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2) + Date.now().toString(36);
        sessionStorage.setItem(STORAGE_KEY, sessionId);
    }
    return sessionId;
}
