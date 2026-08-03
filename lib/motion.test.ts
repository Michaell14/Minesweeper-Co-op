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

describe("cascadeBand measured from the cell a reveal started at", () => {
    it("puts no delay at all on the cell that was clicked", () => {
        // The bug: the delay came off the board diagonal, so opening a single
        // cell at (3, 4) sat invisible for seven bands before it appeared, and
        // (3, 5) for eight. Which is to say the lag varied by where you clicked.
        expect(cascadeBand(3, 4, { row: 3, col: 4 })).toBe(0);
        expect(cascadeBand(9, 9, { row: 9, col: 9 })).toBe(0);
    });

    it("sweeps outward from there, a band per step", () => {
        const origin = { row: 5, col: 5 };
        expect(cascadeBand(5, 6, origin)).toBe(1);
        expect(cascadeBand(4, 5, origin)).toBe(1);
        expect(cascadeBand(4, 4, origin)).toBe(2);
    });

    it("does not care which side of the origin a cell is on", () => {
        const origin = { row: 5, col: 5 };
        expect(cascadeBand(5, 3, origin)).toBe(cascadeBand(5, 7, origin));
        expect(cascadeBand(3, 5, origin)).toBe(cascadeBand(7, 5, origin));
    });

    it("still wraps, so a board-wide cascade never waits on its far corner", () => {
        expect(cascadeBand(31, 15, { row: 0, col: 0 })).toBeLessThan(CASCADE_BANDS);
        expect(cascadeBand(0, CASCADE_BANDS, { row: 0, col: 0 })).toBe(0);
    });

    it("falls back to the diagonal when nothing started it", () => {
        // A whole board arriving at once — the game-over reveal.
        expect(cascadeBand(4, 1, null)).toBe(cascadeBand(4, 1));
        expect(cascadeBand(4, 1, undefined)).toBe(cascadeBand(4, 1));
    });
});
