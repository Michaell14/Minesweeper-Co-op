/**
 * Pure month/day maths for the profile's daily-history calendar.
 *
 * Days are 'YYYY-MM-DD' strings in UTC throughout, mirroring
 * server/domain/streak.js — and for the same reason: parsing a day string
 * through a local-time Date (the `new Date(day).toLocaleDateString()` trap)
 * shifts it a day west of UTC. Everything here goes through Date.UTC or
 * string slicing; a day string is never local-parsed.
 */

export interface MonthCursor {
    year: number;
    /** 1-12, human month — not the 0-11 Date convention. */
    month: number;
}

/** Today as a UTC day string. Fine for display; gameplay never derives this. */
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/** The UTC day before one. Epoch maths so month/year roll over correctly. */
export const dayBefore = (day: string): string =>
    new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** The month a day string falls in. Pure string slicing. */
export const monthOf = (day: string): MonthCursor => ({
    year: parseInt(day.slice(0, 4), 10),
    month: parseInt(day.slice(5, 7), 10),
});

export const addMonths = ({ year, month }: MonthCursor, delta: number): MonthCursor => {
    const zeroBased = year * 12 + (month - 1) + delta;
    return { year: Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
};

/** Negative when a is earlier than b, 0 when equal, positive when later. */
export const compareMonths = (a: MonthCursor, b: MonthCursor): number =>
    a.year * 12 + a.month - (b.year * 12 + b.month);

// Hardcoded rather than toLocaleDateString: a locale-formatted month would be
// the one place the page's language varies by viewer, and locale formatting
// of a bare day string is exactly the local-parse trap this module avoids.
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

export const monthLabel = ({ year, month }: MonthCursor): string =>
    `${MONTH_NAMES[month - 1]} ${year}`;

/** The 'YYYY-MM-DD' key for a day of this month, zero-padded. */
export const dayKey = ({ year, month }: MonthCursor, dayOfMonth: number): string =>
    `${year}-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

/**
 * The month as a Sunday-start grid: leading nulls for the days before the
 * 1st, then every day key, then trailing nulls to a whole number of weeks.
 */
export const buildMonthGrid = (cursor: MonthCursor): (string | null)[] => {
    const { year, month } = cursor;
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(dayKey(cursor, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
};

/**
 * The streak to DISPLAY. The stored value only moves when a result records,
 * so after a missed day it still holds the old run; a streak whose last clear
 * is older than yesterday is over, whatever the row says. The server payload
 * stays a faithful dump of storage — display-time is where staleness belongs.
 */
export const effectiveDailyStreak = (
    stored: number,
    lastDailyDay: string | null,
    today: string,
): number => {
    if (!lastDailyDay) return 0;
    // >= rather than ===: around UTC midnight a client clock can trail the
    // server's, making the last clear look like tomorrow. A future-looking
    // day is a LIVE streak, never a lapsed one — the mirror image of
    // streak.js's earlier-day guard on the server.
    return lastDailyDay >= today || lastDailyDay === dayBefore(today) ? stored : 0;
};
