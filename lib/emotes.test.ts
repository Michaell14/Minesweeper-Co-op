/**
 * The wording a screen reader hears, and the one number that must not be a
 * motion token.
 */
import { describe, expect, it } from "vitest";
import { EMOTE_LIFETIME_MS, emoteAnnouncement } from "./emotes";
import { EMOTES } from "@/shared/emotes";

describe("emoteAnnouncement", () => {
    it("reads as a thing said, not a picture described", () => {
        expect(emoteAnnouncement("Alex", "nice")).toBe("Alex: Nice");
    });

    it.each(EMOTES.map((e) => e.id))("names the catalog id %s", (id) => {
        expect(emoteAnnouncement("Alex", id)).toContain("Alex: ");
    });

    /*
     * Silence rather than a guess. The announcement carries somebody's name,
     * so an emote this build cannot name must not be announced as one it can.
     */
    it("returns null for an id outside the catalog", () => {
        expect(emoteAnnouncement("Alex", "no-such-emote")).toBeNull();
    });
});

describe("EMOTE_LIFETIME_MS", () => {
    /*
     * The reason this is a plain number and not a `--ms-duration-*` token: one
     * media query zeroes every one of those under prefers-reduced-motion, and
     * a lifetime of zero means somebody who asked for less MOTION silently gets
     * no MESSAGES. The float and fade are the part that may be zeroed.
     */
    it("is long enough to read and short enough to clear", () => {
        expect(EMOTE_LIFETIME_MS).toBeGreaterThanOrEqual(2000);
        expect(EMOTE_LIFETIME_MS).toBeLessThanOrEqual(6000);
    });
});
