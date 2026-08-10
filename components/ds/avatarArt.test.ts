/**
 * The avatar art's invariants — the kind that fail silently: a catalog id
 * with no drawing renders as the default and nobody notices, a literal hex
 * survives a palette change while everything around it moves, and a short row
 * just draws nothing where pixels should be.
 */
import { describe, expect, it } from "vitest";
import { AVATARS, DEFAULT_AVATAR } from "@/shared/avatars";
import { AVATAR_ART, avatarArtById } from "./avatarArt";

describe("catalog and art stay in step", () => {
    it("every catalog id has art, and no art lacks a catalog entry", () => {
        const catalogIds = AVATARS.map((a) => a.id).sort();
        expect(Object.keys(AVATAR_ART).sort()).toEqual(catalogIds);
    });

    it("the default id is in the catalog", () => {
        expect(AVATARS.some((a) => a.id === DEFAULT_AVATAR)).toBe(true);
    });
});

describe("every grid is well-formed", () => {
    it.each(Object.entries(AVATAR_ART))("%s is 16x16 with only palette chars", (_id, art) => {
        expect(art.rows).toHaveLength(16);
        for (const row of art.rows) {
            expect(row).toHaveLength(16);
            for (const ch of row) {
                if (ch !== " ") expect(art.palette[ch]).toBeDefined();
            }
        }
    });
});

describe("avatars paint in tokens", () => {
    // Unlike sprite sets there are no seasonal avatars, so there is no id with
    // a licence to use literal colour: every fill must be a var() so the art
    // reads on all palettes.
    it.each(Object.entries(AVATAR_ART))("%s uses no literal colours", (_id, art) => {
        for (const fill of Object.values(art.palette)) {
            expect(fill).toMatch(/^var\(--ms-/);
        }
    });
});

describe("avatarArtById", () => {
    it("falls back to the default for unknown, null and undefined", () => {
        expect(avatarArtById("no-such-avatar")).toBe(AVATAR_ART[DEFAULT_AVATAR]);
        expect(avatarArtById(null)).toBe(AVATAR_ART[DEFAULT_AVATAR]);
        expect(avatarArtById(undefined)).toBe(AVATAR_ART[DEFAULT_AVATAR]);
    });

    it("returns the named art for a known id", () => {
        expect(avatarArtById("fox")).toBe(AVATAR_ART.fox);
    });
});
