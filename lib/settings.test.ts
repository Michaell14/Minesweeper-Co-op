// @vitest-environment jsdom
/**
 * The settings blob: sanitisation (the single gate storage AND the server pass
 * through), the legacy ms-theme migration, and the no-flash script's
 * guarantees — all things that fail silently as a palette quietly reset or a
 * flash of the default on load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    DEFAULT_SETTINGS,
    NO_FLASH_SCRIPT,
    SETTINGS_STORAGE_KEY,
    readStoredSettings,
    sanitizeSettings,
    writeStoredSettings,
} from "./settings";
import { THEMES, THEME_STORAGE_KEY } from "./theme";
import { activeHoliday, localDay } from "./holidays";

/**
 * A day the schedule leaves alone — found, not hardcoded. Every holiday added
 * shrinks the set of ordinary days, and twice now a pin here has quietly become
 * a holiday and changed what these cases were testing.
 */
const ORDINARY_DAY = (() => {
    for (let i = 0; i < 365; i++) {
        const day = new Date(2026, 0, 1 + i);
        if (!activeHoliday(day)) return localDay(day);
    }
    throw new Error("the schedule now covers every day of the year");
})();


beforeEach(() => localStorage.clear());

describe("sanitizeSettings", () => {
    it("round-trips a valid blob", () => {
        const settings = { ...DEFAULT_SETTINGS, theme: "gameboy" };
        expect(sanitizeSettings(settings)).toEqual(settings);
    });

    it.each([[null], [undefined], [42], ["gameboy"], [["gameboy"]]])(
        "defaults everything for non-object input %p",
        (raw) => {
            expect(sanitizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
        },
    );

    it("drops unknown keys — a future version's settings do not stow away", () => {
        const out = sanitizeSettings({ theme: "dark", futureSetting: true });
        expect(out).toEqual({ ...DEFAULT_SETTINGS, theme: "dark" });
        expect("futureSetting" in out).toBe(false);
    });

    it("discards a theme id no palette defines, keeping the rest", () => {
        expect(sanitizeSettings({ theme: "vaporwave" }).theme).toBeNull();
        expect(sanitizeSettings({ theme: 3 }).theme).toBeNull();
    });

    it("accepts every real theme id and the default", () => {
        for (const { id } of THEMES) {
            expect(sanitizeSettings({ theme: id }).theme).toBe(id);
        }
    });

    /*
     * seasonalDismissed suppresses a holiday, so a value that slips through
     * malformed is a palette that never arrives — silent, and only for the
     * player whose storage holds it. Same untrusted-input stance as `theme`.
     */
    it.each(["halloween-2026", "lunar-new-year-2031", null])(
        "accepts the occurrence key %p",
        (value) => {
            expect(sanitizeSettings({ seasonalDismissed: value }).seasonalDismissed).toBe(value);
        },
    );

    it.each([["-2026"], ["halloween"], ["halloween-20261"], ["halloween-26"], [2026], [{}], [true]])(
        "rejects the malformed occurrence key %p",
        (value) => {
            expect(sanitizeSettings({ seasonalDismissed: value }).seasonalDismissed).toBeNull();
        },
    );

    it("defaults seasonal palettes on, dismissing nothing", () => {
        expect(sanitizeSettings({})).toMatchObject({
            seasonalThemes: true,
            seasonalDismissed: null,
        });
        expect(sanitizeSettings({ seasonalThemes: "yes" }).seasonalThemes).toBe(true);
        expect(sanitizeSettings({ seasonalThemes: false }).seasonalThemes).toBe(false);
    });
});

describe("readStoredSettings", () => {
    it("returns defaults on an empty browser", () => {
        expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it("reads back what writeStoredSettings persisted", () => {
        writeStoredSettings({ ...DEFAULT_SETTINGS, theme: "c64" });
        expect(readStoredSettings().theme).toBe("c64");
    });

    it("returns defaults for corrupt JSON instead of throwing", () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, "{not json");
        expect(readStoredSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it("migrates a pre-blob browser's ms-theme key", () => {
        localStorage.setItem(THEME_STORAGE_KEY, "gameboy");
        expect(readStoredSettings().theme).toBe("gameboy");
    });

    it("ignores the legacy key once a blob exists — the blob is the truth", () => {
        localStorage.setItem(THEME_STORAGE_KEY, "gameboy");
        writeStoredSettings({ ...DEFAULT_SETTINGS, theme: "dark" });
        expect(readStoredSettings().theme).toBe("dark");
    });

    it("discards an invalid legacy value", () => {
        localStorage.setItem(THEME_STORAGE_KEY, "removed-palette");
        expect(readStoredSettings().theme).toBeNull();
    });
});

describe("writeStoredSettings", () => {
    it("retires the legacy key it supersedes", () => {
        localStorage.setItem(THEME_STORAGE_KEY, "gameboy");
        writeStoredSettings({ ...DEFAULT_SETTINGS, theme: "gameboy" });
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull();
    });
});

describe("NO_FLASH_SCRIPT", () => {
    /*
     * The script now consults the calendar, so every case below has to state
     * which day it is running on. Without this the two "applies the stored
     * theme" tests below pass for most of the year and fail for the nine days
     * of Halloween — a suite that goes red on a date rather than on a change.
     */
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(new Date(`${ORDINARY_DAY}T12:00:00`));
    });
    afterEach(() => vi.useRealTimers());

    it("reads the settings blob and falls back to the legacy key", () => {
        expect(NO_FLASH_SCRIPT).toContain(SETTINGS_STORAGE_KEY);
        expect(NO_FLASH_SCRIPT).toContain(THEME_STORAGE_KEY);
    });

    it("inlines every real theme id, so a stored value can be validated", () => {
        for (const { id } of THEMES) {
            if (id) expect(NO_FLASH_SCRIPT).toContain(id);
        }
    });

    it("is wrapped in try/catch — storage throws in some privacy modes", () => {
        expect(NO_FLASH_SCRIPT).toContain("try");
        expect(NO_FLASH_SCRIPT).toContain("catch");
    });

    it("closes every brace it opens, since it is injected as raw HTML", () => {
        const open = (NO_FLASH_SCRIPT.match(/\{/g) || []).length;
        const close = (NO_FLASH_SCRIPT.match(/\}/g) || []).length;
        expect(open).toBe(close);
        expect(NO_FLASH_SCRIPT).not.toContain("</script");
    });

    it("actually applies a stored blob theme when executed", () => {
        localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify({ version: 1, theme: "gameboy" }),
        );
        delete document.documentElement.dataset.theme;
        // eslint-disable-next-line no-eval
        eval(NO_FLASH_SCRIPT);
        expect(document.documentElement.dataset.theme).toBe("gameboy");
        delete document.documentElement.dataset.theme;
    });

    it("actually applies a legacy-key theme when executed", () => {
        localStorage.setItem(THEME_STORAGE_KEY, "c64");
        delete document.documentElement.dataset.theme;
        // eslint-disable-next-line no-eval
        eval(NO_FLASH_SCRIPT);
        expect(document.documentElement.dataset.theme).toBe("c64");
        delete document.documentElement.dataset.theme;
    });
});

/*
 * The script carries its own copy of the schedule, because it runs before any
 * bundle and cannot import one. That copy is the thing to distrust: nothing
 * about a wrong window is visible until the day it is wrong, by which point
 * the page has already painted. So rather than assert a handful of dates, this
 * runs the emitted script against `activeHoliday` for every day of a decade —
 * the only check that makes the duplication safe to keep.
 */
describe("the no-flash script agrees with the schedule", () => {
    const run = (day: string, blob?: Record<string, unknown>) => {
        localStorage.clear();
        if (blob) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(blob));
        delete document.documentElement.dataset.theme;
        vi.setSystemTime(new Date(`${day}T12:00:00`));
        // eslint-disable-next-line no-eval
        eval(NO_FLASH_SCRIPT);
        return document.documentElement.dataset.theme ?? null;
    };

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });
    afterEach(() => {
        vi.useRealTimers();
        delete document.documentElement.dataset.theme;
    });

    it("paints exactly what activeHoliday says, every day for ten years", () => {
        const cursor = new Date("2026-01-01T00:00:00Z");
        const end = new Date("2035-12-31T00:00:00Z");
        const disagreements: string[] = [];

        while (cursor <= end) {
            const day = cursor.toISOString().slice(0, 10);
            const painted = run(day);
            const expected = activeHoliday(new Date(`${day}T12:00:00`))?.themeId ?? null;
            if (painted !== expected) {
                disagreements.push(`${day}: script ${painted}, schedule ${expected}`);
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        expect(disagreements).toEqual([]);
    });

    it("overrides a saved palette rather than replacing it", () => {
        expect(run("2026-10-31", { version: 1, theme: "gameboy" })).toBe("halloween");
        // The blob is untouched — the store reads the same value back after.
        expect(readStoredSettings().theme).toBe("gameboy");
    });

    it("leaves the saved palette alone outside the window", () => {
        expect(run(ORDINARY_DAY, { version: 1, theme: "gameboy" })).toBe("gameboy");
    });

    it("respects the seasonal switch", () => {
        expect(
            run("2026-10-31", { version: 1, theme: "gameboy", seasonalThemes: false }),
        ).toBe("gameboy");
    });

    it("respects a dismissal of this occurrence only", () => {
        const dismissed = { version: 1, seasonalDismissed: "halloween-2026" };
        expect(run("2026-10-31", dismissed)).toBeNull();
        expect(run("2027-10-31", dismissed)).toBe("halloween");
        expect(run("2026-12-25", dismissed)).toBe("christmas");
    });

    it("still paints a holiday for a browser with no blob at all", () => {
        expect(run("2026-12-25")).toBe("christmas");
    });

    /*
     * The script carries its OWN region check, and the decade sweep above
     * cannot see it: jsdom reports en-US, so both sides agree by accident.
     * This is the only place the inlined gating is exercised at all.
     */
    describe("region gating, in the script's own copy", () => {
        const asBrowserIn = (language: string, fn: () => void) => {
            const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
            Object.defineProperty(globalThis, "navigator", {
                value: { language, languages: [language] },
                configurable: true,
            });
            try {
                fn();
            } finally {
                if (original) Object.defineProperty(globalThis, "navigator", original);
            }
        };

        const THANKSGIVING = "2026-11-26";

        it("paints Thanksgiving for a US browser", () => {
            asBrowserIn("en-US", () => expect(run(THANKSGIVING)).toBe("thanksgiving"));
        });

        it("leaves it alone everywhere else", () => {
            asBrowserIn("en-GB", () => expect(run(THANKSGIVING)).toBeNull());
            asBrowserIn("ja-JP", () => expect(run(THANKSGIVING)).toBeNull());
        });

        it("fails open when the tag carries no region", () => {
            asBrowserIn("en", () => expect(run(THANKSGIVING)).toBe("thanksgiving"));
        });

        /* A script subtag between language and region is the case that fails
         * open by accident, and the initial paint is where it would be seen. */
        it("reads past a script subtag", () => {
            asBrowserIn("zh-Hans-CN", () => expect(run(THANKSGIVING)).toBeNull());
            asBrowserIn("sr-Latn-RS", () => expect(run(THANKSGIVING)).toBeNull());
        });

        it("does not gate the holidays that are not gated", () => {
            asBrowserIn("en-GB", () => expect(run("2026-12-25")).toBe("christmas"));
        });
    });
});

describe("the gameplay and HUD settings", () => {
    it("defaults to the classic bindings with everything visible", () => {
        expect(DEFAULT_SETTINGS).toMatchObject({
            swapMouseButtons: false,
            mobileDefaultFlag: false,
            chording: true,
            confetti: true,
            shareCursor: true,
            keyboardControls: true,
            showTimer: true,
            showFlagCounter: true,
            showProgressBar: true,
            cellSize: "standard",
        });
    });

    it("accepts booleans and rejects everything else, per key", () => {
        const flipped = sanitizeSettings({
            swapMouseButtons: true,
            chording: false,
            confetti: false,
            shareCursor: false,
            showTimer: false,
        });
        expect(flipped.swapMouseButtons).toBe(true);
        expect(flipped.chording).toBe(false);
        expect(flipped.showTimer).toBe(false);

        // "true"-the-string is the classic localStorage corruption.
        const corrupt = sanitizeSettings({ swapMouseButtons: "true", chording: 1 });
        expect(corrupt.swapMouseButtons).toBe(false);
        expect(corrupt.chording).toBe(true);
    });

    it("keyboard controls: off survives, junk defaults on", () => {
        expect(sanitizeSettings({ keyboardControls: false }).keyboardControls).toBe(false);
        expect(sanitizeSettings({ keyboardControls: "yes" }).keyboardControls).toBe(true);
        expect(sanitizeSettings({ keyboardControls: 1 }).keyboardControls).toBe(true);
    });

    it("accepts each cell size and defaults an unknown one", () => {
        expect(sanitizeSettings({ cellSize: "compact" }).cellSize).toBe("compact");
        expect(sanitizeSettings({ cellSize: "large" }).cellSize).toBe("large");
        expect(sanitizeSettings({ cellSize: "enormous" }).cellSize).toBe("standard");
        expect(sanitizeSettings({ cellSize: 40 }).cellSize).toBe("standard");
    });
});

describe("the sound settings", () => {
    it("ships OFF — nobody gets surprise audio", () => {
        expect(DEFAULT_SETTINGS.sound).toBe(false);
        expect(DEFAULT_SETTINGS.soundVolume).toBe(0.5);
    });

    it("clamps the volume into [0, 1] and defaults garbage", () => {
        expect(sanitizeSettings({ soundVolume: 0.8 }).soundVolume).toBe(0.8);
        expect(sanitizeSettings({ soundVolume: 7 }).soundVolume).toBe(1);
        expect(sanitizeSettings({ soundVolume: -2 }).soundVolume).toBe(0);
        expect(sanitizeSettings({ soundVolume: "loud" }).soundVolume).toBe(0.5);
        expect(sanitizeSettings({ soundVolume: NaN }).soundVolume).toBe(0.5);
    });
});

describe("custom theme ids in settings", () => {
    it("accepts custom:<slug> and rejects malformed ones", () => {
        expect(sanitizeSettings({ theme: "custom:midnight" }).theme).toBe("custom:midnight");
        expect(sanitizeSettings({ theme: "custom:my-theme-2" }).theme).toBe("custom:my-theme-2");
        expect(sanitizeSettings({ theme: "custom:" }).theme).toBeNull();
        expect(sanitizeSettings({ theme: "custom:Bad Id" }).theme).toBeNull();
        expect(sanitizeSettings({ theme: `custom:${"x".repeat(50)}` }).theme).toBeNull();
    });
});

describe("NO_FLASH_SCRIPT with a custom theme", () => {
    it("stamps the stored palette before paint, palette-layer names only", () => {
        localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify({ version: 1, theme: "custom:midnight" }),
        );
        localStorage.setItem(
            "minesweeper_custom_themes",
            JSON.stringify([
                {
                    id: "midnight",
                    palette: {
                        "--ms-palette-ink": "#eeeeee",
                        "--ms-palette-paper": "#181820",
                        "--evil-prop": "#123456",
                        "--ms-palette-sneaky": "url(x)",
                    },
                },
            ]),
        );
        const root = document.documentElement;
        // eslint-disable-next-line no-eval
        eval(NO_FLASH_SCRIPT);
        expect(root.style.getPropertyValue("--ms-palette-ink")).toBe("#eeeeee");
        expect(root.style.getPropertyValue("--ms-palette-paper")).toBe("#181820");
        // Non-palette names and non-hex values never reach the style attribute.
        expect(root.style.getPropertyValue("--evil-prop")).toBe("");
        expect(root.style.getPropertyValue("--ms-palette-sneaky")).toBe("");
        expect(root.dataset.theme).toBeUndefined();
        root.removeAttribute("style");
    });

    it("does nothing for a custom id with no stored theme", () => {
        localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify({ version: 1, theme: "custom:ghost" }),
        );
        const root = document.documentElement;
        // eslint-disable-next-line no-eval
        eval(NO_FLASH_SCRIPT);
        expect(root.getAttribute("style")).toBeNull();
        expect(root.dataset.theme).toBeUndefined();
    });
});
