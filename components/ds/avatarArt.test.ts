/**
 * The avatar art's invariants — the kind that fail silently: a catalog id
 * with no drawing renders as the default and nobody notices, a literal hex
 * survives a palette change while everything around it moves, and a short row
 * just draws nothing where pixels should be.
 */
import { describe, expect, it } from "vitest";
import { AVATARS, DEFAULT_AVATAR } from "@/shared/avatars";
import { AVATAR_ART, AVATAR_HOVER_FRAMES, avatarArtById, avatarFramesById } from "./avatarArt";

/** Every grid that can be drawn — base art and hover frames alike, since a
 * malformed frame is invisible until someone hovers the one avatar. */
const everyFrame = Object.entries(AVATAR_ART).flatMap(([id, art]) => [
    [id, art] as const,
    ...(AVATAR_HOVER_FRAMES[id] ?? []).map((frame, i) => [`${id} frame ${i + 1}`, frame] as const),
]);

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
    it.each(everyFrame)("%s is 16x16 with only palette chars", (_id, art) => {
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
    it.each(everyFrame)("%s uses no literal colours", (_id, art) => {
        for (const fill of Object.values(art.palette)) {
            expect(fill).toMatch(/^var\(--ms-/);
        }
    });
});

describe("hover frames", () => {
    it("only name avatars that exist", () => {
        for (const id of Object.keys(AVATAR_HOVER_FRAMES)) {
            expect(AVATAR_ART[id]).toBeDefined();
        }
    });

    // An empty list is the failure: it leaves an avatar marked as animated
    // with nothing to flip to. One extra frame is a legitimate two-pose loop.
    it("are never an empty list", () => {
        for (const [id, frames] of Object.entries(AVATAR_HOVER_FRAMES)) {
            expect(frames.length, id).toBeGreaterThan(0);
        }
    });

    // A frame copied and left unedited passes every other check here — right
    // size, right palette, keyframes and all — and animates to nothing. The
    // only thing that catches it is asking whether any pixel actually moved.
    it.each(Object.keys(AVATAR_HOVER_FRAMES))("%s draws a distinct pose per frame", (id) => {
        const drawn = avatarFramesById(id).map((art) => art.rows.join("\n"));
        expect(new Set(drawn).size, `${id} repeats a pose`).toBe(drawn.length);
    });

    it("play after the base art", () => {
        expect(avatarFramesById("frog")[0]).toBe(AVATAR_ART.frog);
        expect(avatarFramesById("frog").slice(1)).toEqual(AVATAR_HOVER_FRAMES.frog);
    });

    // True of the whole catalog since the twelve were animated together. An
    // avatar added without frames still renders — it just sits there — so this
    // is here to make that a decision rather than an oversight.
    it("cover every avatar in the catalog", () => {
        for (const { id } of AVATARS) {
            expect(AVATAR_HOVER_FRAMES[id], `${id} has no hover frames`).toBeDefined();
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
