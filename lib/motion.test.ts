import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion } from "./motion";

const originalMatchMedia = globalThis.window?.matchMedia;

afterEach(() => {
    if (originalMatchMedia) globalThis.window.matchMedia = originalMatchMedia;
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
