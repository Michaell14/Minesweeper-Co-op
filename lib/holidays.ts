/**
 * The seasonal schedule: which holiday palette, if any, is in season today.
 *
 * A holiday is a palette in app/tokens.css that the date picks, and it
 * OVERRIDES `settings.theme` rather than replacing it (see `activeOverride`
 * and state/settingsSlice.ts). Dates are 'YYYY-MM-DD' strings compared as
 * strings, as in server/domain/streak.js. "Today" is the player's LOCAL date,
 * so the schedule is client-trusted, the right trade for a palette. Windows
 * are whole days, so `activeHoliday` can only change at local midnight and
 * `msUntilLocalMidnight` is the whole scheduling story.
 */

/** A schedule entry. `id` is both the `data-theme` value and the key prefix. */
interface Holiday {
    id: string;
    /** The window for a given year, inclusive, or null if unknown (see LUNAR_NEW_YEAR). */
    window: (year: number) => { start: string; end: string } | null;
    /**
     * ISO 3166-1 alpha-2 regions this holiday is offered in. Omitted means
     * everywhere; hiding a holiday from someone who keeps it is the worse mistake.
     */
    regions?: string[];
}

/**
 * The regions the browser claims, from its language tags. A regex rather than
 * `Intl.Locale` because the no-flash script needs the same thing and cannot
 * import. NOT `maximize()`d: a bare "en" would resolve to "US" and hand
 * Thanksgiving to every English speaker. The region is matched by POSITION,
 * past any script/extlang subtags (`zh-Hans-CN`, `zh-yue-HK`), not as "the
 * first two-letter subtag" (`en-u-ca-gregory` has a `ca` that is a calendar).
 */
const REGION_TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z]{3}){0,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2})(?![A-Za-z0-9])/;

export function browserRegions(): string[] {
    if (typeof navigator === "undefined") return [];
    const tags = [navigator.language, ...(navigator.languages ?? [])];
    const regions = new Set<string>();
    for (const tag of tags) {
        const match = REGION_TAG.exec(tag ?? "");
        if (match) regions.add(match[1].toUpperCase());
    }
    return [...regions];
}

/** Fails OPEN: no region claimed means no basis to hide anything. */
const inRegion = (holiday: Holiday, regions: string[]): boolean =>
    !holiday.regions || regions.length === 0 || holiday.regions.some((r) => regions.includes(r));

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

/** Shifts a day string by n days, in UTC so a local DST jump cannot move it. */
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
 * Lunar New Year has no closed form worth carrying, so it is a table. Past the
 * last entry the holiday stops firing (never a wrong date or a throw);
 * `holidays.test.ts` fails once the runway drops below five years.
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
 * Order is PRECEDENCE: the first window containing today wins. Lunar New Year
 * overlaps Valentine's in 2032 and lands inside it in 2029 and 2037, so the
 * movable holiday is listed first.
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
    { id: "pride", window: fixed("06-01", "06-30") },
    // Ends ON the night: Día de Muertos is adjacent, not overlapping.
    { id: "halloween", window: fixed("10-24", "10-31") },
    { id: "day-of-the-dead", window: fixed("11-01", "11-02") },
    /*
     * The one holiday wrong to show worldwide: a national holiday with no date
     * in common elsewhere, and a northern-autumn palette. Everything else stays
     * global; deciding which holidays are "theirs" is the worse failure.
     */
    {
        id: "thanksgiving",
        window: around((year) => nthWeekday(year, 11, 4, 4), 6, 3),
        regions: ["US"],
    },
    { id: "christmas", window: fixed("12-15", "12-26") },
    /*
     * The only window crossing New Year, which is why `activeHoliday` scans the
     * neighbouring years. Keyed to the year it STARTS in, so a dismissal on
     * 31 December still holds on 1 January.
     */
    { id: "newyear", window: (year) => ({ start: `${year}-12-30`, end: `${year + 1}-01-02` }) },
];

/** Every seasonal palette id. */
export const HOLIDAY_THEME_IDS: string[] = HOLIDAYS.map((h) => h.id);

/**
 * The holiday in season on a date, ignoring preferences. Neighbouring years
 * are checked so a window may cross New Year; the key's year is the window's
 * own. Year is the OUTER loop, matching SCHEDULE_SNIPPET, so the two agree
 * about a window overlapping one from an adjacent year.
 */
export function activeHoliday(
    now: Date = new Date(),
    regions: string[] = browserRegions(),
): HolidayOccurrence | null {
    const today = localDay(now);
    const year = now.getFullYear();
    for (const y of [year - 1, year, year + 1]) {
        for (const holiday of HOLIDAYS) {
            if (!inRegion(holiday, regions)) continue;
            const window = holiday.window(y);
            if (window && today >= window.start && today <= window.end) {
                return { themeId: holiday.id, key: `${holiday.id}-${y}` };
            }
        }
    }
    return null;
}

/**
 * Milliseconds until the next local midnight, the only instant `activeHoliday`
 * can change. Built from local Y/M/D rather than adding 24h, so DST days still
 * land on midnight. Always > 0, so a timer armed on the boundary cannot spin.
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
 * The holiday palette painting right now: in season, seasonal themes on, and
 * this OCCURRENCE not dismissed (dismissing Halloween 2026 leaves Christmas
 * 2026 and Halloween 2027 alone).
 */
export function activeOverride(prefs: SeasonalPrefs, now: Date = new Date()): HolidayOccurrence | null {
    if (!prefs.seasonalThemes) return null;
    const holiday = activeHoliday(now);
    if (!holiday || holiday.key === prefs.seasonalDismissed) return null;
    return holiday;
}

/**
 * The schedule as the no-flash script needs it: inlinable in <head>, no
 * imports. Duplicates the logic above because the script runs before any
 * bundle; `settings.test.ts` runs it against `activeHoliday` for every day of
 * a decade so the two cannot drift.
 */
export const SCHEDULE_SNIPPET = `
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function shift(day, n) {
    var d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // The pattern is INTERPOLATED, not retyped: hand-copying it into a template
  // literal is how a \\b becomes a BACKSPACE escape, which turns the regex into
  // one that never matches and fails the gate open everywhere.
  function regionsOf() {
    if (typeof navigator === 'undefined') return [];
    var tags = [navigator.language].concat(navigator.languages || []);
    var out = [];
    for (var i = 0; i < tags.length; i++) {
      var m = /${REGION_TAG.source}/.exec(tags[i] || '');
      if (m && out.indexOf(m[1].toUpperCase()) === -1) out.push(m[1].toUpperCase());
    }
    return out;
  }
  function holidayOn(now) {
    var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    var here = regionsOf();
    // Fails open, exactly as inRegion does.
    var us = here.length === 0 || here.indexOf('US') !== -1;
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
      if (us) spans.push(['thanksgiving', shift(thu, -6), shift(thu, 3)]);
      spans.push(['christmas', y + '-12-15', y + '-12-26']);
      spans.push(['newyear', y + '-12-30', (y + 1) + '-01-02']);
      for (var j = 0; j < spans.length; j++) {
        if (today >= spans[j][1] && today <= spans[j][2]) return [spans[j][0], spans[j][0] + '-' + y];
      }
    }
    return null;
  }
`.trim();
