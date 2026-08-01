import { afterEach, describe, expect, it, vi } from "vitest";
import { CASCADE_BANDS, cascadeBand, prefersReducedMotion } from "./motion";

// Every test here stubs `window` wholesale, so unstubbing restores matchMedia
// with it. Restoring matchMedia by hand as well would have to run BEFORE this
// line to mean anything, and by then `window` may be the `undefined` that the
// no-window test stubbed in — the restore would throw and this would never run.
afterEach(() => {
    vi.unstubAllGlobals();
});

/** Minimal stand-in — only `.matches` is read. */
function stubMatchMedia(matches: boolean) {
    const matchMedia = vi.fn().mockReturnValue({ matches });
    vi.stubGlobal("window", { matchMedia });
    return matchMedia;
}

describe("prefersReducedMotion", () => {
    it("is true when the user asked for reduced motion", () => {
        stubMatchMedia(true);
        expect(prefersReducedMotion()).toBe(true);
    });

    it("is false when they did not", () => {
        stubMatchMedia(false);
        expect(prefersReducedMotion()).toBe(false);
    });

    it("queries the standard media feature", () => {
        const matchMedia = stubMatchMedia(true);
        prefersReducedMotion();
        expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    });

    it("defaults to allowing motion when there is no window at all", () => {
        vi.stubGlobal("window", undefined);
        expect(prefersReducedMotion()).toBe(false);
    });

    it("defaults to allowing motion when matchMedia is missing", () => {
        // Some embedded webviews have `window` but no matchMedia; throwing here
        // would take down the win handler that calls it.
        vi.stubGlobal("window", {});
        expect(() => prefersReducedMotion()).not.toThrow();
        expect(prefersReducedMotion()).toBe(false);
    });
});

describe("cascadeBand", () => {
    it("stays inside the ramp for every cell of the largest board", () => {
        // BOARD_LIMITS allows up to 32 rows x 16 cols.
        for (let row = 0; row < 32; row++) {
            for (let col = 0; col < 16; col++) {
                const band = cascadeBand(row, col);
                expect(band).toBeGreaterThanOrEqual(0);
                expect(band).toBeLessThan(CASCADE_BANDS);
            }
        }
    });

    it("bounds the wait no matter where on the board the cascade starts", () => {
        // The bug this replaced: a cascade at the far corner waited for its
        // absolute diagonal index, so the first cell appeared ~240ms late.
        expect(cascadeBand(0, 0)).toBe(0);
        expect(cascadeBand(31, 15)).toBeLessThan(CASCADE_BANDS);
    });

    it("advances by one per diagonal, so neighbours sweep in sequence", () => {
        expect(cascadeBand(4, 0)).toBe(4);
        expect(cascadeBand(3, 1)).toBe(4);
        expect(cascadeBand(4, 1)).toBe(5);
    });

    it("wraps rather than growing without bound", () => {
        expect(cascadeBand(0, CASCADE_BANDS)).toBe(0);
        expect(cascadeBand(0, CASCADE_BANDS + 3)).toBe(3);
    });
});
