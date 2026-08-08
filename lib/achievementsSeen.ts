import type { EarnedAchievement } from "@/lib/statsApi";

/**
 * Which earned achievements are new since this browser last looked at the
 * shelf — a watermark, exactly like lib/changelog.ts's unseen badge, and in
 * localStorage for the same reason: "have I seen this" is per-browser, not
 * per-tab.
 *
 * A watermark rather than a set of seen ids: the server hands the list back
 * newest-first, so one ISO timestamp answers the question for every row, and
 * a shelf that grows never grows the stored value.
 *
 * The dot lives on the profile page rather than the footer on purpose. The
 * footer would have to fetch stats on every route just to decide whether to
 * draw it, and it still could not light up until the player navigated. The
 * moment an achievement is earned belongs to a live socket event, not to a
 * poll.
 */

const STORAGE_KEY = "minesweeper_achievements_last_seen";

const readWatermark = (): string | null => {
    if (typeof window === "undefined") return null;
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        // Storage disabled (private mode, blocked cookies) throws on read.
        // No storage means no highlight, not no page.
        return null;
    }
};

/**
 * The ids earned since the watermark. A browser that has never looked gets an
 * EMPTY set, not the whole shelf: a first visit showing forty "New" badges is
 * noise, and the watermark it writes makes the next genuine unlock stand out.
 */
export function newlyEarned(achievements: EarnedAchievement[]): Set<string> {
    const lastSeen = readWatermark();
    if (lastSeen === null) return new Set();
    // ISO-8601 UTC timestamps compare correctly as strings — and every one of
    // them sorts after the empty watermark an empty shelf writes.
    return new Set(achievements.filter((a) => a.earnedAt > lastSeen).map((a) => a.id));
}

/**
 * Records that the shelf has been looked at, up to its newest row.
 *
 * An EMPTY shelf stores an empty watermark rather than storing nothing. The
 * two are different states: nothing stored means "never looked", which
 * suppresses the first visit's badges; an empty watermark means "looked, and
 * there was nothing there", so the very first achievement earned afterwards
 * still gets to announce itself.
 */
export function markAchievementsSeen(achievements: EarnedAchievement[]): void {
    if (typeof window === "undefined") return;
    // Newest first is the server's ORDER BY; scan anyway rather than trust it,
    // since too high a watermark silently suppresses every future badge.
    const newest = achievements.reduce((max, a) => (a.earnedAt > max ? a.earnedAt : max), "");
    try {
        localStorage.setItem(STORAGE_KEY, newest);
    } catch {
        // Persistence is optional when storage is unavailable or full.
    }
}
