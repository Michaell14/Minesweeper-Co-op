import { describe, expect, test } from "vitest";
import {
    HOLIDAY_THEME_IDS,
    activeHoliday,
    activeOverride,
    browserRegions,
    localDay,
    msUntilLocalMidnight,
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
        ["2026-10-31", "halloween"], // the night itself, and the last day of it
        ["2026-10-24", "halloween"], // first day
        ["2026-11-01", "day-of-the-dead"], // picks up where Halloween stops
        ["2026-11-02", "day-of-the-dead"],
        ["2026-03-17", "stpatricks"],
        ["2026-06-15", "pride"],
        ["2026-12-25", "christmas"],
        ["2026-02-17", "lunar-new-year"], // the day, from the table
        ["2026-02-14", "valentines"],
        ["2026-11-26", "thanksgiving"], // 4th Thursday of Nov 2026
        ["2027-11-25", "thanksgiving"], // and it moves with the year
    ])("%s is %s", (day, id) => {
        expect(activeHoliday(on(day))?.themeId).toBe(id);
    });

    test.each(["2026-11-03", "2026-07-01", "2026-12-27", "2026-02-25", "2026-05-30"])(
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

});

/*
 * New Year is the only window that crosses into the next Gregorian year, and
 * the reason `activeHoliday` scans neighbouring years at all — a scan that
 * shipped unused and unproven until this palette existed.
 */
describe("the window that crosses New Year", () => {
    test.each([
        ["2026-12-30", "newyear-2026"],
        ["2026-12-31", "newyear-2026"],
        ["2027-01-01", "newyear-2026"], // the far side, still the SAME occurrence
        ["2027-01-02", "newyear-2026"],
    ])("%s is %s", (day, key) => {
        expect(activeHoliday(on(day))?.key).toBe(key);
    });

    test("stops on the far edge", () => {
        expect(activeHoliday(on("2027-01-03"))).toBeNull();
        expect(activeHoliday(on("2026-12-29"))).toBeNull();
    });

    /*
     * One key across the boundary is the point: dismissing it at 23:00 on the
     * 31st must not un-dismiss itself an hour later, which is exactly what a
     * key derived from the CURRENT year rather than the window's would do.
     */
    test("a dismissal on the way in survives midnight", () => {
        const prefs = { seasonalThemes: true, seasonalDismissed: "newyear-2026" };
        expect(activeOverride(prefs, on("2026-12-31"))).toBeNull();
        expect(activeOverride(prefs, on("2027-01-01"))).toBeNull();
    });
});

/*
 * Windows overlapping by accident is the failure a schedule this size invites:
 * the loser simply never paints, and nothing says so. Counting the days each
 * holiday actually wins catches a new window eating an old one, which asserting
 * a few dates does not.
 */
describe("no holiday quietly eats another", () => {
    const SPANS: Record<string, number> = {
        "lunar-new-year": 8,
        valentines: 6,
        stpatricks: 4,
        pride: 30,
        halloween: 8,
        "day-of-the-dead": 2,
        thanksgiving: 10,
        christmas: 12,
        newyear: 4,
    };

    const daysWonIn = (year: number) => {
        const won: Record<string, number> = {};
        for (const day of everyDay(`${year}-01-01`, `${year}-12-31`)) {
            const id = activeHoliday(day, ["US"])?.themeId;
            if (id) won[id] = (won[id] ?? 0) + 1;
        }
        return won;
    };

    /* 2026: Lunar New Year is 17 Feb, clear of Valentine's, so nobody overlaps. */
    test("every holiday wins its whole span in a year with no collision", () => {
        const won = daysWonIn(2026);
        // New Year is split across the year boundary: two days at each end.
        expect(won).toEqual({ ...SPANS, newyear: 4 });
    });

    /* 2029: Lunar New Year is 13 Feb and lands inside Valentine's. */
    test("only the documented collision costs a holiday days", () => {
        const won = daysWonIn(2029);
        expect(won["lunar-new-year"]).toBe(SPANS["lunar-new-year"]);
        expect(won.valentines).toBeLessThan(SPANS.valentines);
        for (const id of Object.keys(SPANS)) {
            if (id === "valentines") continue;
            expect({ [id]: won[id] }).toEqual({ [id]: SPANS[id] });
        }
    });
});

/*
 * Region gating. Thanksgiving is the only holiday it applies to, and the rule
 * that matters is which way it fails: a browser claiming no region at all must
 * still see everything, because "we could not tell" is not a reason to hide a
 * holiday from someone who keeps it.
 */
describe("region gating", () => {
    const thanksgiving2026 = on("2026-11-26");

    test("Thanksgiving shows in the US", () => {
        expect(activeHoliday(thanksgiving2026, ["US"])?.themeId).toBe("thanksgiving");
    });

    test.each([[["GB"]], [["AU"]], [["DE", "FR"]]])(
        "Thanksgiving stays away in %p",
        (regions) => {
            expect(activeHoliday(thanksgiving2026, regions)).toBeNull();
        },
    );

    test("an unknown region sees it — gating fails open", () => {
        expect(activeHoliday(thanksgiving2026, [])?.themeId).toBe("thanksgiving");
    });

    test("a US browser with several languages still counts as US", () => {
        expect(activeHoliday(thanksgiving2026, ["GB", "US"])?.themeId).toBe("thanksgiving");
    });

    /* Everything else is deliberately global; a regression here is a palette
     * quietly disappearing for most of the world. */
    test.each([
        ["2026-12-25", "christmas"],
        ["2026-10-31", "halloween"],
        ["2026-11-01", "day-of-the-dead"],
        ["2026-03-17", "stpatricks"],
        ["2026-02-17", "lunar-new-year"],
    ])("%s is %s everywhere", (day, id) => {
        for (const regions of [["US"], ["GB"], ["JP"], []]) {
            expect(activeHoliday(on(day), regions)?.themeId).toBe(id);
        }
    });
});

describe("browserRegions", () => {
    /* A bare "en" must NOT resolve to US — that is the whole point of not
     * maximising the tag, and it is what would hand Thanksgiving to Britain. */
    test("reads regions from language tags, and only when present", () => {
        const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
        const set = (language: string, languages: string[]) =>
            Object.defineProperty(globalThis, "navigator", {
                value: { language, languages },
                configurable: true,
            });

        set("en-GB", ["en-GB", "fr-FR"]);
        expect(browserRegions()).toEqual(["GB", "FR"]);

        set("en", ["en"]);
        expect(browserRegions()).toEqual([]);

        set("en_US", ["en_US"]);
        expect(browserRegions()).toEqual(["US"]);

        if (original) Object.defineProperty(globalThis, "navigator", original);
        else delete (globalThis as { navigator?: unknown }).navigator;
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

/*
 * The only instant at which activeHoliday can change, and therefore the whole
 * scheduling story for a tab that stays open (components/SettingsSync.tsx).
 */
describe("msUntilLocalMidnight", () => {
    test("counts to the next local midnight, not 24h from now", () => {
        expect(msUntilLocalMidnight(on("2026-06-15"))).toBe(12 * 60 * 60 * 1000);
    });

    /* A zero would let a timer armed on the boundary spin. */
    test("is a full day at midnight exactly, never zero", () => {
        const midnight = new Date(2026, 5, 15, 0, 0, 0, 0);
        expect(msUntilLocalMidnight(midnight)).toBe(24 * 60 * 60 * 1000);
    });

    test("is always positive, across a year of local times", () => {
        for (let day = 0; day < 365; day++) {
            for (const hour of [0, 1, 2, 3, 12, 23]) {
                const at = new Date(2026, 0, 1 + day, hour, 30, 0, 0);
                expect(msUntilLocalMidnight(at)).toBeGreaterThan(0);
            }
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
