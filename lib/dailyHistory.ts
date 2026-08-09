import { dayBefore } from "@/lib/dailyCalendar";

/**
 * This browser's daily-challenge results, one per puzzle date, kept for the
 * share text's streak line. Local-first on purpose: works for guests, no
 * network at share time — the tradeoff is that a signed-in player alternating
 * devices can see a shorter streak here than their profile shows.
 *
 * Keys are the PUZZLE date (the server-issued `dailyDate`), never a
 * client-derived "today" — an attempt finished just after UTC midnight
 * belongs to the day it was set, the same rule game/daily.js applies to stats.
 */

export interface DailyResult {
    won: boolean;
}

const STORAGE_KEY = "minesweeper_daily_history";

const isDayKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);

const parseEntry = (value: unknown): DailyResult | null => {
    if (typeof value !== "object" || value === null) return null;
    const { won } = value as Record<string, unknown>;
    return typeof won === "boolean" ? { won } : null;
};

/** Everything stored, with anything unreadable dropped — localStorage is
 * untrusted input (bestTimes.ts's rule). */
export const readDailyHistory = (): Record<string, DailyResult> => {
    if (typeof window === "undefined") return {};

    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return {}; // Disabled or blocked, e.g. Safari private browsing.
    }
    if (!raw) return {};

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

    const out: Record<string, DailyResult> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!isDayKey(key)) continue;
        const entry = parseEntry(value);
        if (entry) out[key] = entry;
    }
    return out;
};

/**
 * Files a terminal result under its puzzle date. First write wins: an attempt
 * is immutable once terminal, so a second write for the same date is always a
 * re-delivery (a resume, a second tab), never new information.
 */
export const recordDailyResult = (date: string, result: DailyResult): void => {
    if (typeof window === "undefined" || !isDayKey(date)) return;

    const history = readDailyHistory();
    if (history[date]) return;

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...history, [date]: result }));
    } catch {
        // Full or blocked. The streak just won't count this day.
    }
};

/** Consecutive daily WINS ending on `endDate` — a loss or missing day there
 * is 0, so a loss's share never brags about the streak it just ended. */
export const dailyWinStreak = (history: Record<string, DailyResult>, endDate: string): number => {
    let streak = 0;
    let day = endDate;
    while (history[day]?.won) {
        streak++;
        day = dayBefore(day);
    }
    return streak;
};

/** Forgets every result. Used by tests to reset between cases. */
export const clearDailyHistory = (): void => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to do; the history was never persisted anyway.
    }
};
