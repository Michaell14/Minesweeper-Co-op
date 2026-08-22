/**
 * The emote art's invariants — the kind that fail silently: a catalog id with
 * no drawing sends a reaction nobody sees, a literal hex survives a palette
 * change while everything around it moves, and a short row just draws nothing
 * where pixels should be.
 *
 * The catalog-and-art check is the load-bearing one: the SERVER validates
 * against shared/emotes.js and the CLIENT draws from this file, so an id in one
 * and not the other is a message that passes every guard on the wire and
 * arrives as nothing at all.
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
    // Unlike the seasonal sprite pairs there is no emote with a licence to use
    // literal colour: a reaction is drawn on whichever palette the RECEIVER
    // runs, which the sender has no say in.
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
     * Null, not a fallback glyph — the opposite of avatarArtById, and the
     * difference matters: an avatar must always draw because a leaderboard row
     * needs a face, but substituting a different emote would put words in
     * somebody's mouth. The feed drops what it cannot draw.
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
