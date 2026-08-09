import { dayBefore } from "@/lib/dailyCalendar";

/**
 * This browser's daily-challenge results, one per puzzle date, kept for the
 * share text's streak line ("🔥 5-day streak").
 *
 * localStorage for the same reason bestTimes.ts uses it: a result should
 * outlive its tab. Local-first deliberately — it works for guests and needs no
 * network at share time. The tradeoff is that it is per-device, so a signed-in
 * player alternating devices can see a shorter streak here than their profile
 * shows; acceptable for share flair.
 *
 * Keys are the PUZZLE date (the server-issued `dailyDate`), never a
 * client-derived "today" — an attempt finished just after UTC midnight belongs
 * to the day it was set, the same rule game/daily.js applies to stats.
 */

export interface DailyResult {
    won: boolean;
    /** Null for results recorded without a time (a resumed pre-replay attempt). */
    elapsedMs: number | null;
}

const STORAGE_KEY = "minesweeper_daily_history";

const isDayKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);

/** A stored entry, or null if it is missing or has been corrupted. */
const parseEntry = (value: unknown): DailyResult | null => {
    if (typeof value !== "object" || value === null) return null;
    const { won, elapsedMs } = value as Record<string, unknown>;
    if (typeof won !== "boolean") return null;
    return {
        won,
        elapsedMs: typeof elapsedMs === "number" && Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null,
    };
};

/**
 * Everything stored, with anything unreadable dropped. localStorage is
 * untrusted input — a corrupt blob loses the history rather than throwing on a
 * page with a game running in it (bestTimes.ts's rule).
 */
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
 * is one per day and immutable once terminal, so a re-delivery of the same
 * outcome (a resume, a second tab) must not overwrite what is already filed.
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

/**
 * Consecutive daily WINS ending on `endDate`, walking back a day at a time.
 * A loss or missing day on `endDate` itself is a streak of 0 — the share for
 * a loss never brags about a streak that run just ended.
 */
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
