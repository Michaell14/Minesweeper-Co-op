/**
 * The one place that asks whether the user wants motion.
 *
 * CSS covers itself — the duration tokens in app/tokens.css collapse under
 * `prefers-reduced-motion`, so every transition follows automatically. This is
 * for the motion CSS cannot reach: a canvas particle burst has no duration to
 * zero, so the decision has to happen before it is drawn.
 */
export function prefersReducedMotion(): boolean {
    // Not just SSR: matchMedia is missing in some embedded webviews, and the
    // safe default there is to keep the animation the majority expects.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
