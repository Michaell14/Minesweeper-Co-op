/**
 * The seasonal schedule: which holiday palette, if any, is in season today.
 *
 * A holiday is a palette in app/tokens.css like any other — the only new idea
 * is that the date picks it, and that it OVERRIDES `settings.theme` rather than
 * replacing it. Someone who set Game Boy in March is painted Halloween in
 * October and back on Game Boy in November, having lost nothing; see
 * `activeOverride` and state/settingsSlice.ts.
 *
 * Dates are 'YYYY-MM-DD' strings throughout, same stance as
 * server/domain/streak.js: string comparison is the whole date maths, and no
 * Date object survives past the boundary where one is needed.
 *
 * "Today" is the player's LOCAL date, not UTC — Christmas should feel like
 * Christmas in Auckland at the same time it does in Auckland. That makes the
 * schedule client-trusted (a changed system clock summons Halloween early),
 * which is the correct trade for a palette.
 *
 * Windows are whole-day granular, which is what makes keeping a long-lived tab
 * in step cheap: `activeHoliday` can only ever change at LOCAL MIDNIGHT, so
 * there is no boundary to search for. `msUntilLocalMidnight` is the whole
 * scheduling story — components/SettingsSync.tsx arms one timer at a time.
 */

/** A schedule entry. `id` is both the `data-theme` value and the key prefix. */
interface Holiday {
    id: string;
    /** The window for a given year, inclusive, or null if unknown (see LUNAR_NEW_YEAR). */
    window: (year: number) => { start: string; end: string } | null;
}

/** What is in season: the palette to paint, and the key that dismisses it. */
export interface HolidayOccurrence {
    /** `data-theme` value. */
    themeId: string;
    /** Stable per-year id — 'halloween-2026'. What `seasonalDismissed` holds. */
    key: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day a Date falls on. */
export const localDay = (d: Date): string =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * A day string shifted by n days. Parsed as UTC deliberately: this is calendar
 * arithmetic on a date that is already fixed, so a DST jump in the player's
 * zone must not move it.
 */
const shiftDay = (day: string, n: number): string => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

/** The nth given weekday of a month. weekday: 0 = Sunday. */
const nthWeekday = (year: number, month: number, weekday: number, n: number): string => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return shiftDay(`${year}-${pad(month)}-01`, offset + (n - 1) * 7);
};

/** A window pinned to fixed calendar dates. */
const fixed = (start: string, end: string) => (year: number) => ({
    start: `${year}-${start}`,
    end: `${year}-${end}`,
});

/** A window around a computed anchor day. */
const around = (anchor: (year: number) => string | null, before: number, after: number) =>
    (year: number) => {
        const day = anchor(year);
        return day ? { start: shiftDay(day, -before), end: shiftDay(day, after) } : null;
    };

/**
 * Lunar New Year has no closed form worth carrying, so it is a table.
 *
 * When it runs out the holiday simply stops firing — the schedule degrades to
 * "no holiday today", never to a wrong date or a throw. `holidays.test.ts`
 * fails once the runway drops below five years, which is the reminder to
 * extend it rather than a licence to forget.
 */
const LUNAR_NEW_YEAR_DAYS: Record<number, string> = {
    2025: "01-29",
    2026: "02-17",
    2027: "02-06",
    2028: "01-26",
    2029: "02-13",
    2030: "02-03",
    2031: "01-23",
    2032: "02-11",
    2033: "01-31",
    2034: "02-19",
    2035: "02-08",
    2036: "01-28",
    2037: "02-15",
    2038: "02-04",
    2039: "01-24",
    2040: "02-12",
};

/**
 * Order is PRECEDENCE: the first window containing today wins.
 *
 * This is not hypothetical. Lunar New Year runs the day before to six days
 * after, so in 2032 (Feb 11) it overlaps Valentine's — and in 2029 and 2037 it
 * lands inside it. The rarer, movable holiday is listed first and takes those
 * years; Valentine's gets the other twelve.
 */
const HOLIDAYS: Holiday[] = [
    {
        id: "lunar-new-year",
        window: around((year) => {
            const day = LUNAR_NEW_YEAR_DAYS[year];
            return day ? `${year}-${day}` : null;
        }, 1, 6),
    },
    { id: "valentines", window: fixed("02-10", "02-15") },
    { id: "stpatricks", window: fixed("03-15", "03-18") },
    // The longest window by far, and the only one measured in weeks.
    { id: "pride", window: fixed("06-01", "06-30") },
    // Ends ON the night. It used to run a day longer, which left no room for
    // Día de Muertos — the two are adjacent, not overlapping, in the calendar.
    { id: "halloween", window: fixed("10-24", "10-31") },
    { id: "day-of-the-dead", window: fixed("11-01", "11-02") },
    // The fourth Thursday of November, from the Friday before to the Sunday after.
    { id: "thanksgiving", window: around((year) => nthWeekday(year, 11, 4, 4), 6, 3) },
    { id: "christmas", window: fixed("12-15", "12-26") },
    /*
     * The only window that crosses New Year, which is why `activeHoliday` scans
     * the neighbouring years at all — that scan shipped unused. The occurrence
     * is keyed to the year it STARTS in, so 31 December and 1 January are one
     * `newyear-2026`, and dismissing it on the way in does not un-dismiss it
     * four hours later.
     */
    { id: "newyear", window: (year) => ({ start: `${year}-12-30`, end: `${year + 1}-01-02` }) },
];

/** Every seasonal palette id. */
export const HOLIDAY_THEME_IDS: string[] = HOLIDAYS.map((h) => h.id);

/**
 * The holiday in season on a given date, ignoring the player's preferences.
 * Neighbouring years are checked too so a window may cross New Year without
 * the caller knowing; the key's year is always the window's own.
 *
 * Year is the OUTER loop, matching SCHEDULE_SNIPPET exactly — the two would
 * otherwise disagree about a window that overlaps one from an adjacent year,
 * which is the kind of divergence that shows up once and in December.
 */
export function activeHoliday(now: Date = new Date()): HolidayOccurrence | null {
    const today = localDay(now);
    const year = now.getFullYear();
    for (const y of [year - 1, year, year + 1]) {
        for (const holiday of HOLIDAYS) {
            const window = holiday.window(y);
            if (window && today >= window.start && today <= window.end) {
                return { themeId: holiday.id, key: `${holiday.id}-${y}` };
            }
        }
    }
    return null;
}

/**
 * Milliseconds until the next local midnight — the only instant at which
 * `activeHoliday` can return something different.
 *
 * Built from the local Y/M/D rather than by adding 24h, so the days a DST
 * change makes 23 or 25 hours long still land on midnight rather than an hour
 * either side of it. Always > 0: exactly at midnight it returns a full day
 * ahead, so a timer armed on the boundary cannot spin.
 */
export function msUntilLocalMidnight(now: Date = new Date()): number {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}

/** The subset of settings the override depends on. */
export interface SeasonalPrefs {
    seasonalThemes: boolean;
    seasonalDismissed: string | null;
}

/**
 * The holiday palette actually painting right now: in season, seasonal themes
 * left on, and this year's occurrence not already switched away from.
 *
 * The dismissal is per OCCURRENCE, so switching away from Halloween 2026 keeps
 * Christmas 2026 coming and brings Halloween back in 2027.
 */
export function activeOverride(prefs: SeasonalPrefs, now: Date = new Date()): HolidayOccurrence | null {
    if (!prefs.seasonalThemes) return null;
    const holiday = activeHoliday(now);
    if (!holiday || holiday.key === prefs.seasonalDismissed) return null;
    return holiday;
}

/**
 * The schedule as the no-flash script needs it: source small enough to inline
 * in <head>, with no import and no Date parsing beyond `new Date()`.
 *
 * This duplicates the logic above, which is a real cost paid for a real
 * reason — the script runs before any bundle, so it cannot call it.
 * `settings.test.ts` runs the emitted script against `activeHoliday` for every
 * day of a decade, so the two cannot drift silently.
 */
export const SCHEDULE_SNIPPET = `
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function shift(day, n) {
    var d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function holidayOn(now) {
    var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var lny = ${JSON.stringify(LUNAR_NEW_YEAR_DAYS)};
    for (var i = -1; i <= 1; i++) {
      var y = now.getFullYear() + i;
      var spans = [];
      if (lny[y]) spans.push(['lunar-new-year', shift(y + '-' + lny[y], -1), shift(y + '-' + lny[y], 6)]);
      spans.push(['valentines', y + '-02-10', y + '-02-15']);
      spans.push(['stpatricks', y + '-03-15', y + '-03-18']);
      spans.push(['pride', y + '-06-01', y + '-06-30']);
      spans.push(['halloween', y + '-10-24', y + '-10-31']);
      spans.push(['day-of-the-dead', y + '-11-01', y + '-11-02']);
      var nov = new Date(Date.UTC(y, 10, 1));
      var thu = shift(y + '-11-01', ((4 - nov.getUTCDay() + 7) % 7) + 21);
      spans.push(['thanksgiving', shift(thu, -6), shift(thu, 3)]);
      spans.push(['christmas', y + '-12-15', y + '-12-26']);
      spans.push(['newyear', y + '-12-30', (y + 1) + '-01-02']);
      for (var j = 0; j < spans.length; j++) {
        if (today >= spans[j][1] && today <= spans[j][2]) return [spans[j][0], spans[j][0] + '-' + y];
      }
    }
    return null;
  }
`.trim();
