import type { EarnedAchievement } from "@/lib/statsApi";

/**
 * Which earned achievements are new since this browser last looked at the
 * shelf: a localStorage watermark, like lib/changelog.ts's unseen badge. One
 * ISO timestamp rather than a set of seen ids, since the list arrives
 * newest-first and the stored value never grows. The dot lives on the profile
 * page, not the footer, which would have to fetch stats on every route.
 */

const STORAGE_KEY = "minesweeper_achievements_last_seen";

const readWatermark = (): string | null => {
    if (typeof window === "undefined") return null;
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        // Storage disabled throws on read. No storage means no highlight, not no page.
        return null;
    }
};

/**
 * The ids earned since the watermark. A browser that has never looked gets an
 * EMPTY set: forty "New" badges on a first visit is noise.
 */
export function newlyEarned(achievements: EarnedAchievement[]): Set<string> {
    const lastSeen = readWatermark();
    if (lastSeen === null) return new Set();
    // ISO-8601 UTC timestamps compare correctly as strings, and all sort after the empty watermark.
    return new Set(achievements.filter((a) => a.earnedAt > lastSeen).map((a) => a.id));
}

/**
 * Records that the shelf has been looked at, up to its newest row. An EMPTY
 * shelf stores an empty watermark, not nothing: nothing stored means "never
 * looked", an empty watermark means "looked, nothing there", so the first
 * achievement afterwards still announces itself.
 */
export function markAchievementsSeen(achievements: EarnedAchievement[]): void {
    if (typeof window === "undefined") return;
    // Scan rather than trust the server's ORDER BY: too high a watermark suppresses every future badge.
    const newest = achievements.reduce((max, a) => (a.earnedAt > max ? a.earnedAt : max), "");
    try {
        localStorage.setItem(STORAGE_KEY, newest);
    } catch {
        // Persistence is optional when storage is unavailable or full.
    }
}
