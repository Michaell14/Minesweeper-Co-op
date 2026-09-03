/**
 * Whether this browser has been shown the daily challenge's rules.
 *
 * /daily opens straight onto the board, so nothing on the way in explains what
 * the rules are — one attempt, one shared board, a clock that starts on the
 * first click. The explainer covers that once and then stays out of the way.
 *
 * localStorage rather than sessionStorage, and a flag rather than a watermark:
 * "have I read this" is per-browser and the copy has no versions to compare
 * against, unlike lib/achievementsSeen.ts's timestamp. Deliberately NOT tied to
 * lib/dailyIdentity.ts's token, which is discarded every day — this must not
 * come back each morning.
 */

const STORAGE_KEY = "minesweeper_daily_explainer_seen";

/**
 * True only when the flag is definitely stored. Blocked storage (private mode)
 * throws on read, and showing the explainer again is the better failure than
 * suppressing it forever.
 */
export function hasSeenDailyExplainer(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
        return false;
    }
}

/** Records that it has been shown. Silent when storage is unavailable or full. */
export function markDailyExplainerSeen(): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, "true");
    } catch {
        // Persistence is optional; the explainer simply shows again.
    }
}
