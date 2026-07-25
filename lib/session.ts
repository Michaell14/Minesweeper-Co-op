/**
 * Session utility to retrieve or generate a persistent player session ID.
 * Stored in localStorage so the player maintains identity across page reloads & reconnects.
 */
export function getOrCreateSessionId(): string {
    if (typeof window === "undefined") return "";
    let sessionId = localStorage.getItem("minesweeper_session_id") || "";
    if (!sessionId) {
        sessionId = typeof crypto !== 'undefined' && crypto.randomUUID 
            ? crypto.randomUUID() 
            : Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem("minesweeper_session_id", sessionId);
    }
    return sessionId;
}
