// @vitest-environment jsdom
/**
 * The settings blob: sanitisation (the single gate storage AND the server pass
 * through), the legacy ms-theme migration, and the no-flash script's
 * guarantees — all things that fail silently as a palette quietly reset or a
 * flash of the default on load.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    DEFAULT_SETTINGS,
    NO_FLASH_SCRIPT,
    SETTINGS_STORAGE_KEY,
    readStoredSettings,
    sanitizeSettings,
    writeStoredSettings,
} from "./settings";
import { THEMES, THEME_STORAGE_KEY } from "./theme";

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
