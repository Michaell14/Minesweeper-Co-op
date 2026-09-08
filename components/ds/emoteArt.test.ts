/**
 * The emote art's silent failures. The catalog-and-art check is load-bearing:
 * the SERVER validates against shared/emotes.js and the CLIENT draws from this
 * file, so an id in one and not the other passes every guard and arrives as
 * nothing.
 */
import { describe, expect, it } from "vitest";
import { EMOTES } from "@/shared/emotes";
import { EMOTE_ART, emoteArtById } from "./emoteArt";

const everyGlyph = Object.entries(EMOTE_ART);

describe("catalog and art stay in step", () => {
    it("every catalog id has art, and no art lacks a catalog entry", () => {
        expect(Object.keys(EMOTE_ART).sort()).toEqual(EMOTES.map((e) => e.id).sort());
    });

    it("every catalog entry has a label to announce", () => {
        for (const { id, label } of EMOTES) {
            expect(label.length, `${id} has no label`).toBeGreaterThan(0);
        }
    });
});

describe("every grid is well-formed", () => {
    it.each(everyGlyph)("%s is 16x16 with only palette chars", (_id, art) => {
        expect(art.rows).toHaveLength(16);
        for (const row of art.rows) {
            expect(row).toHaveLength(16);
            for (const ch of row) {
                if (ch !== " ") expect(art.palette[ch]).toBeDefined();
            }
        }
    });

    // A grid of nothing passes every check above and draws nothing at all.
    it.each(everyGlyph)("%s actually draws something", (_id, art) => {
        expect(art.rows.join("").trim().length).toBeGreaterThan(0);
    });
});

describe("emotes paint in tokens", () => {
    // No emote may use literal colour: it is drawn on whichever palette the RECEIVER runs.
    it.each(everyGlyph)("%s uses no literal colours", (_id, art) => {
        for (const fill of Object.values(art.palette)) {
            expect(fill).toMatch(/^var\(--ms-/);
        }
    });
});

describe("emoteArtById", () => {
    it("returns the named art for a catalog id", () => {
        expect(emoteArtById("nice")).toBe(EMOTE_ART.nice);
    });

    /*
     * Null, not a fallback glyph (unlike avatarArtById): substituting another
     * emote would put words in somebody's mouth. The feed drops it instead.
     */
    it.each([
        ["an unknown id", "no-such-emote"],
        ["null", null],
        ["undefined", undefined],
        ["the empty string", ""],
    ])("returns null for %s", (_label, id) => {
        expect(emoteArtById(id)).toBeNull();
    });
});
