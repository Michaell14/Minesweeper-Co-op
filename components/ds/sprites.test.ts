import { describe, expect, test } from "vitest";
import { HOLIDAY_THEME_IDS } from "@/lib/holidays";
import { VALID_THEME_IDS } from "@/lib/theme";
import {
    DEFAULT_SET,
    GENERAL_SPRITE_SETS,
    SPRITE_SET_IDS,
    SPRITE_SETS,
    spriteSetById,
    spriteSetFor,
    type SpriteSet,
} from "./sprites";
import { toRects, type PixelArt } from "./pixelArt";

/**
 * The art table, checked for mistakes that draw something plausible: a short
 * row truncates the sprite, a glyph with no palette entry paints black.
 */

const ALL: [string, SpriteSet][] = [
    ["default", DEFAULT_SET],
    ...GENERAL_SPRITE_SETS.map(({ id, set }) => [id, set] as [string, SpriteSet]),
    ...Object.entries(SPRITE_SETS),
];
const EVERY_ART: [string, PixelArt][] = ALL.flatMap(([name, set]) => [
    [`${name} mine`, set.mine],
    [`${name} flag`, set.flag],
]);

describe("every sprite is a 16x16 grid", () => {
    test.each(EVERY_ART)("%s", (_name, art) => {
        expect(art.rows).toHaveLength(16);
        expect(art.rows.filter((row) => row.length !== 16)).toEqual([]);
    });
});

describe("every pixel has a colour", () => {
    test.each(EVERY_ART)("%s", (_name, art) => {
        const unpainted = [...new Set(art.rows.join("").split(""))]
            .filter((glyph) => glyph !== " ")
            .filter((glyph) => !art.palette[glyph]);
        expect(unpainted).toEqual([]);
    });

    /* And the other way: a palette entry nothing uses is a colour that moved. */
    test.each(EVERY_ART)("%s uses every colour it lists", (_name, art) => {
        const drawn = new Set(art.rows.join("").split(""));
        expect(Object.keys(art.palette).filter((glyph) => !drawn.has(glyph))).toEqual([]);
    });

    test.each(EVERY_ART)("%s is not blank", (_name, art) => {
        expect(toRects(art).length).toBeGreaterThan(4);
    });
});

describe("colours are a hex or a token, never a bare name", () => {
    test.each(EVERY_ART)("%s", (_name, art) => {
        const odd = Object.entries(art.palette)
            .filter(([, value]) => !/^#[0-9a-f]{3,6}$/i.test(value) && !/^var\(--ms-[\w-]+\)$/.test(value))
            .map(([glyph, value]) => `${glyph}: ${value}`);
        expect(odd).toEqual([]);
    });

    /*
     * The default pair and every GENERAL set paint on twelve palettes, so no
     * literals (a black bomb vanishes on Game Boy). Seasonal pairs may, each
     * appearing on its own palette alone.
     */
    test.each([
        ["default", DEFAULT_SET] as [string, SpriteSet],
        ...GENERAL_SPRITE_SETS.map(({ id, set }) => [id, set] as [string, SpriteSet]),
    ])("the %s pair is drawn entirely in tokens", (_name, set) => {
        const literals = [set.mine, set.flag]
            .flatMap((art) => Object.values(art.palette))
            .filter((value) => !value.startsWith("var("));
        expect(literals).toEqual([]);
    });
});

describe("the table lines up with the palettes", () => {
    test("every seasonal palette has a set", () => {
        expect(HOLIDAY_THEME_IDS.filter((id) => !SPRITE_SETS[id])).toEqual([]);
    });

    test("every set names a real palette", () => {
        expect(Object.keys(SPRITE_SETS).filter((id) => !VALID_THEME_IDS.includes(id))).toEqual([]);
    });

    test("a mine is never its own flag", () => {
        const same = ALL.filter(([, set]) => set.mine === set.flag).map(([name]) => name);
        expect(same).toEqual([]);
    });

    test("no seasonal set is quietly the default one", () => {
        const inherited = Object.entries(SPRITE_SETS)
            .filter(([, set]) => set.mine === DEFAULT_SET.mine || set.flag === DEFAULT_SET.flag)
            .map(([id]) => id);
        expect(inherited).toEqual([]);
    });
});

describe("resolving a palette to its pair", () => {
    test("a seasonal palette gets its own", () => {
        expect(spriteSetFor("halloween")).toBe(SPRITE_SETS.halloween);
    });

    /* The default palette, an ordinary theme, and a custom one (null) alike. */
    test.each([null, "gameboy", "unknown-theme"])("%s falls back to the default", (theme) => {
        expect(spriteSetFor(theme)).toBe(DEFAULT_SET);
    });
});

describe("the pinnable ids", () => {
    test("cover classic and every general set, and nothing seasonal", () => {
        expect(SPRITE_SET_IDS).toEqual(["classic", ...GENERAL_SPRITE_SETS.map((s) => s.id)]);
        expect(SPRITE_SET_IDS.filter((id) => SPRITE_SETS[id])).toEqual([]);
    });

    /* A general id that matched a palette id would let spriteSetFor shadow it. */
    test("no general id collides with a palette id", () => {
        expect(SPRITE_SET_IDS.filter((id) => VALID_THEME_IDS.includes(id))).toEqual([]);
    });

    test("spriteSetById resolves a pin and refuses everything else", () => {
        expect(spriteSetById("classic")).toBe(DEFAULT_SET);
        for (const { id, set } of GENERAL_SPRITE_SETS) {
            expect(spriteSetById(id)).toBe(set);
        }
        // Seasonal ids are not pins — a stale blob falls back to following.
        expect(spriteSetById("halloween")).toBeNull();
        expect(spriteSetById("pirate")).toBeNull();
        expect(spriteSetById(null)).toBeNull();
    });
});
