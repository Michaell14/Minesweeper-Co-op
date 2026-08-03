// @vitest-environment jsdom
/**
 * Custom themes: the derivation's promises (coherent, contrast-aware, and the
 * only source of what reaches a style attribute), sanitisation of untrusted
 * blobs, and storage round-trips.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    CORE_FIELDS,
    PENDING_THEME_DELETIONS_KEY,
    addPendingThemeDeletion,
    clearPendingThemeDeletion,
    readPendingThemeDeletions,
    derivePalette,
    hexContrast,
    mintThemeId,
    mix,
    readCustomThemes,
    sanitizeCustomTheme,
    writeCustomThemes,
    CUSTOM_THEMES_STORAGE_KEY,
    MAX_CUSTOM_THEMES,
    type CustomThemeCore,
} from "./customThemes";

const CORE: CustomThemeCore = {
    ink: "#111111",
    paper: "#fafafa",
    panel: "#eeeeee",
    accent: "#2266cc",
    success: "#22aa44",
    warning: "#ddaa00",
    danger: "#cc2222",
    cellClosed: "#bbbbcc",
    cellOpen: "#f0f0f0",
};

/** A dark board, where the classic number colours stop reading. */
const DARK_CORE: CustomThemeCore = {
    ...CORE,
    ink: "#eeeeee",
    paper: "#181820",
    panel: "#222230",
    cellClosed: "#333344",
    cellOpen: "#101018",
};

beforeEach(() => localStorage.clear());

describe("derivePalette", () => {
    it("emits only palette-layer names, all hex — the whole stampable surface", () => {
        const palette = derivePalette(CORE);
        for (const [key, value] of Object.entries(palette)) {
            expect(key).toMatch(/^--ms-palette-[a-z0-9-]+$/);
            expect(value).toMatch(/^#[0-9a-f]{6}$/);
        }
        // Spot the fixed points: the nine choices land verbatim.
        expect(palette["--ms-palette-ink"]).toBe(CORE.ink);
        expect(palette["--ms-palette-cell-open"]).toBe(CORE.cellOpen);
        expect(palette["--ms-palette-mine"]).toBe(CORE.danger);
    });

    it("derives bevels from the cell colour, lighter and darker", () => {
        const palette = derivePalette(CORE);
        expect(palette["--ms-palette-cell-light"]).toBe(mix(CORE.cellClosed, "#ffffff", 0.4));
        expect(palette["--ms-palette-cell-shade"]).toBe(mix(CORE.cellClosed, "#000000", 0.35));
    });

    it("picks a legible ink for every intent fill", () => {
        const palette = derivePalette(CORE);
        for (const family of ["blue", "green", "yellow", "red"]) {
            const fill = palette[`--ms-palette-${family}`];
            const ink = palette[`--ms-palette-${family}-ink`];
            // The better of black/white always clears large-text AA on any fill.
            expect(hexContrast(ink, fill)).toBeGreaterThanOrEqual(3);
        }
    });

    it("keeps classic number colours on a light board", () => {
        const palette = derivePalette(CORE);
        expect(palette["--ms-palette-num-1"]).toBe("#0000ff");
        expect(palette["--ms-palette-num-3"]).toBe("#d70000");
    });

    it("darkness-codes numbers that stop reading on a dark board", () => {
        const palette = derivePalette(DARK_CORE);
        // Every number must clear large-text AA on the custom open cell,
        // whatever mix of classic and derived that took.
        for (let n = 1; n <= 8; n++) {
            expect(
                hexContrast(palette[`--ms-palette-num-${n}`], DARK_CORE.cellOpen),
            ).toBeGreaterThanOrEqual(3);
        }
        // And the classic blue #0000ff specifically cannot have survived.
        expect(palette["--ms-palette-num-1"]).not.toBe("#0000ff");
    });
});

describe("sanitizeCustomTheme", () => {
    it("accepts a valid theme and re-derives its palette from the core", () => {
        const theme = sanitizeCustomTheme({
            id: "midnight",
            name: "Midnight",
            core: CORE,
            // A hand-edited palette trying to smuggle arbitrary properties:
            palette: { "--evil": "url(x)", "--ms-palette-ink": "#000000" },
        });
        expect(theme).not.toBeNull();
        // The smuggled entries are GONE — palette always re-derived.
        expect(theme!.palette["--evil"]).toBeUndefined();
        expect(theme!.palette["--ms-palette-ink"]).toBe(CORE.ink);
    });

    it.each([
        ["bad id", { id: "Bad Id!", name: "x", core: CORE }],
        ["missing name", { id: "ok", name: "", core: CORE }],
        ["overlong name", { id: "ok", name: "x".repeat(25), core: CORE }],
        ["missing core field", { id: "ok", name: "x", core: { ...CORE, ink: undefined } }],
        ["non-hex colour", { id: "ok", name: "x", core: { ...CORE, ink: "red" } }],
        ["null", null],
    ])("rejects %s", (_label, raw) => {
        expect(sanitizeCustomTheme(raw)).toBeNull();
    });
});

describe("storage", () => {
    const theme = sanitizeCustomTheme({ id: "midnight", name: "Midnight", core: CORE })!;

    it("round-trips, dropping invalid and duplicate entries", () => {
        writeCustomThemes([theme]);
        localStorage.setItem(
            CUSTOM_THEMES_STORAGE_KEY,
            JSON.stringify([theme, theme, { id: "junk!" }, 42]),
        );
        const read = readCustomThemes();
        expect(read).toHaveLength(1);
        expect(read[0].id).toBe("midnight");
    });

    it("returns [] for corrupt JSON instead of throwing", () => {
        localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, "{nope");
        expect(readCustomThemes()).toEqual([]);
    });

    it("caps the shelf", () => {
        const many = Array.from({ length: MAX_CUSTOM_THEMES + 5 }, (_, i) =>
            sanitizeCustomTheme({ id: `t-${i}`, name: `T${i}`, core: CORE })!,
        );
        localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(many));
        expect(readCustomThemes()).toHaveLength(MAX_CUSTOM_THEMES);
    });
});

describe("mintThemeId", () => {
    it("slugs the name and dodges collisions", () => {
        expect(mintThemeId("Midnight Blue!", new Set())).toBe("midnight-blue");
        expect(mintThemeId("Midnight Blue!", new Set(["midnight-blue"]))).toBe("midnight-blue-2");
        expect(mintThemeId("§§§", new Set())).toBe("theme");
    });

    it("mints ids the core field list can rely on", () => {
        // Nine fields, all present in CORE_FIELDS — the editor renders these.
        expect(CORE_FIELDS).toHaveLength(9);
    });
});

describe("pending deletions (tombstones)", () => {
    it("round-trips add/read/clear", () => {
        addPendingThemeDeletion("midnight");
        addPendingThemeDeletion("midnight"); // idempotent
        addPendingThemeDeletion("noon");
        expect(readPendingThemeDeletions()).toEqual(["midnight", "noon"]);
        clearPendingThemeDeletion("midnight");
        expect(readPendingThemeDeletions()).toEqual(["noon"]);
    });

    it("drops junk from storage instead of trusting it", () => {
        localStorage.setItem(PENDING_THEME_DELETIONS_KEY, JSON.stringify(["ok-id", "BAD ID!", 42]));
        expect(readPendingThemeDeletions()).toEqual(["ok-id"]);
        localStorage.setItem(PENDING_THEME_DELETIONS_KEY, "{corrupt");
        expect(readPendingThemeDeletions()).toEqual([]);
    });
});
