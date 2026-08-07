import { describe, expect, it } from "vitest";
import {
    CURSOR_RAMP_SIZE,
    SWATCH_TOKENS,
    THEMES,
    cursorColorForId,
    readSwatches,
    swatchesFromPalette,
} from "./theme";

describe("THEMES", () => {
    it("has exactly one default, and it is first", () => {
        const defaults = THEMES.filter((t) => t.id === null);
        expect(defaults).toHaveLength(1);
        expect(THEMES[0].id).toBeNull();
    });

    it("has unique ids and labels", () => {
        const ids = THEMES.map((t) => t.id);
        const labels = THEMES.map((t) => t.label);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(labels).size).toBe(labels.length);
    });
});

/*
 * The card swatches. Only the palette-map half is testable here — reading
 * tokens.css needs a real stylesheet, so `readSwatches` is covered by the
 * smoke suite, which is also the only place the load-bearing property (each
 * card showing its OWN palette, not the applied one) is observable.
 */
describe("swatchesFromPalette", () => {
    const full = Object.fromEntries(
        SWATCH_TOKENS.map((token, i) => [`--ms-palette-${token}`, `#00000${i}`]),
    );

    it("returns the five tokens in declared order", () => {
        expect(swatchesFromPalette(full)).toEqual(
            SWATCH_TOKENS.map((token) => full[`--ms-palette-${token}`]),
        );
    });

    /* Four of five would render a strip that silently misrepresents the theme. */
    it("returns nothing at all when an entry is missing", () => {
        const { [`--ms-palette-${SWATCH_TOKENS[2]}`]: _dropped, ...partial } = full;
        expect(swatchesFromPalette(partial)).toEqual([]);
        expect(swatchesFromPalette({})).toEqual([]);
    });
});

describe("readSwatches", () => {
    /* No stylesheet to walk: no swatches, rather than five transparent boxes. */
    it("degrades to empty where tokens.css is not loaded", () => {
        expect(readSwatches().size).toBe(0);
    });
});

// NO_FLASH_SCRIPT moved to lib/settings.ts with the rest of theme persistence;
// its guarantees are covered in lib/settings.test.ts.

describe("cursorColorForId", () => {
    it("returns a palette token reference, not a literal colour", () => {
        expect(cursorColorForId("abc")).toMatch(/^var\(--ms-palette-cursor-[1-6]\)$/);
    });

    it("is stable for the same id", () => {
        expect(cursorColorForId("socket-xyz")).toBe(cursorColorForId("socket-xyz"));
    });

    it("stays inside the ramp for ids of any shape", () => {
        const ids = ["", "a", "ZZZZZZZZZZZZZZZZZZZZ", "🙂", "-".repeat(200), "0"];
        for (const id of ids) {
            const n = Number(cursorColorForId(id).match(/cursor-(\d)/)![1]);
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(CURSOR_RAMP_SIZE);
        }
    });

    it("spreads realistic socket ids across the whole ramp", () => {
        const used = new Set(
            Array.from({ length: 200 }, (_, i) => cursorColorForId(`socket_${i}abcXYZ`)),
        );
        expect(used.size).toBe(CURSOR_RAMP_SIZE);
    });
});
