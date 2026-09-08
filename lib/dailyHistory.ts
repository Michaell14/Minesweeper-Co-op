import { dayBefore } from "@/lib/dailyCalendar";

/**
 * This browser's daily results, one per puzzle date, for the share text's
 * streak line. Local-first so it works for guests with no network at share
 * time; a player alternating devices may see a shorter streak than their
 * profile. Keys are the server-issued puzzle date, never a client "today".
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

/** Everything stored, with anything unreadable dropped: localStorage is untrusted input. */
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
 * Files a terminal result under its puzzle date. First write wins: a second
 * write for the same date is always a re-delivery, never new information.
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

/** Consecutive daily WINS ending on `endDate`; a loss there is 0, so its share never brags. */
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
