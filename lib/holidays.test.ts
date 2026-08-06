import { describe, expect, test } from "vitest";
import {
    HOLIDAY_THEME_IDS,
    activeHoliday,
    activeOverride,
    localDay,
} from "@/lib/holidays";
import { THEMES } from "@/lib/theme";

/** Local noon, so no timezone can push the date onto a neighbouring day. */
const on = (day: string) => new Date(`${day}T12:00:00`);

/** Every day from `from` to `to` inclusive, as local-noon Dates. */
function everyDay(from: string, to: string): Date[] {
    const days: Date[] = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cursor <= end) {
        days.push(on(cursor.toISOString().slice(0, 10)));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

describe("the windows land where they should", () => {
    test.each([
        ["2026-10-31", "halloween"], // the night itself
        ["2026-10-24", "halloween"], // first day
        ["2026-11-01", "halloween"], // the morning after
        ["2026-12-25", "christmas"],
        ["2026-02-17", "lunar-new-year"], // the day, from the table
        ["2026-02-14", "valentines"],
        ["2026-11-26", "thanksgiving"], // 4th Thursday of Nov 2026
        ["2027-11-25", "thanksgiving"], // and it moves with the year
    ])("%s is %s", (day, id) => {
        expect(activeHoliday(on(day))?.themeId).toBe(id);
    });

    test.each(["2026-11-02", "2026-06-15", "2026-12-27", "2026-02-25", "2026-01-01"])(
        "%s is an ordinary day",
        (day) => {
            expect(activeHoliday(on(day))).toBeNull();
        },
    );

    test("the key carries the window's own year, not the browser's", () => {
        expect(activeHoliday(on("2026-12-25"))?.key).toBe("christmas-2026");
        expect(activeHoliday(on("2027-12-25"))?.key).toBe("christmas-2027");
    });
});

/*
 * Lunar New Year overlaps Valentine's in a handful of years and lands INSIDE
 * it in others. Precedence is declared, not incidental, so it gets asserted at
 * the years where it actually bites.
 */
describe("the Lunar New Year / Valentine's collision", () => {
    test("Lunar New Year takes the years it overlaps", () => {
        expect(activeHoliday(on("2029-02-13"))?.themeId).toBe("lunar-new-year");
        expect(activeHoliday(on("2032-02-11"))?.themeId).toBe("lunar-new-year");
    });

    test("Valentine's keeps the years it does not", () => {
        expect(activeHoliday(on("2026-02-14"))?.themeId).toBe("valentines");
        expect(activeHoliday(on("2027-02-14"))?.themeId).toBe("valentines");
    });

    /*
     * Two holidays painting on the same day is fine — one wins. Two windows
     * from DIFFERENT years overlapping is not: `activeHoliday` scans years
     * outermost, so the older window would win over a higher-precedence newer
     * one, and the no-flash script would have to make the same wrong choice to
     * stay in step.
     */
    test("no window reaches into an adjacent year's", () => {
        for (const day of everyDay("2026-01-01", "2036-12-31")) {
            const holiday = activeHoliday(day);
            if (!holiday) continue;
            expect(Number(holiday.key.slice(-4))).toBe(day.getFullYear());
        }
    });
});

describe("the schedule stays serviceable", () => {
    /*
     * The Lunar New Year table is finite and silently stops firing when it
     * runs out — the failure a table has instead of a formula. Five years of
     * runway is the reminder to top it up.
     */
    test("Lunar New Year is scheduled at least five years out", () => {
        const soon = new Date();
        soon.setFullYear(soon.getFullYear() + 5);
        const days = everyDay(localDay(new Date()), localDay(soon));
        const found = days.some((d) => activeHoliday(d)?.themeId === "lunar-new-year");
        expect(found).toBe(true);
    });

    /*
     * A window with no palette behind it stamps a data-theme matching no rules:
     * the default renders while the schedule believes a holiday is on.
     */
    test("every scheduled holiday has a palette to paint", () => {
        for (const id of HOLIDAY_THEME_IDS) {
            expect(THEMES.find((t) => t.id === id)).toBeDefined();
        }
    });
});

describe("the override respects the player", () => {
    const halloween = on("2026-10-31");

    test("paints when in season and untouched", () => {
        expect(
            activeOverride({ seasonalThemes: true, seasonalDismissed: null }, halloween),
        ).toEqual({ themeId: "halloween", key: "halloween-2026" });
    });

    test("stays away when the switch is off", () => {
        expect(
            activeOverride({ seasonalThemes: false, seasonalDismissed: null }, halloween),
        ).toBeNull();
    });

    test("stays away once this occurrence is dismissed", () => {
        expect(
            activeOverride(
                { seasonalThemes: true, seasonalDismissed: "halloween-2026" },
                halloween,
            ),
        ).toBeNull();
    });

    /* The point of keying the dismissal by occurrence rather than by a flag. */
    test("a dismissal does not carry to the next holiday", () => {
        expect(
            activeOverride(
                { seasonalThemes: true, seasonalDismissed: "halloween-2026" },
                on("2026-12-25"),
            ),
        ).toEqual({ themeId: "christmas", key: "christmas-2026" });
    });

    test("a dismissal does not carry to next year", () => {
        expect(
            activeOverride(
                { seasonalThemes: true, seasonalDismissed: "halloween-2026" },
                on("2027-10-31"),
            ),
        ).toEqual({ themeId: "halloween", key: "halloween-2027" });
    });
});
