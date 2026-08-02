/**
 * The one place that asks whether the user wants motion.
 *
 * CSS covers itself — the duration tokens in app/tokens.css collapse under
 * `prefers-reduced-motion`. This is for the motion CSS cannot reach: a canvas
 * particle burst has no duration to zero, so the call happens before it is drawn.
 */
export function prefersReducedMotion(): boolean {
    // Not just SSR: matchMedia is missing in some embedded webviews, and the
    // safe default there is to keep the animation the majority expects.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * How many diagonals the cascade reveal repeats over before wrapping.
 *
 * Paired with `--ms-cascade-step` in app/tokens.css — that token is the delay
 * per band, this is how many bands there are, and the feel is the product of
 * the two. Neither is meaningful alone, so change them together.
 */
export const CASCADE_BANDS = 10;

/**
 * Which band of the cascade sweep a cell belongs to.
 *
 * The wrap is the point: on the raw diagonal, a cascade mid-board waited for its
 * ABSOLUTE index before any cell appeared — ~240ms of nothing, which reads as
 * lag rather than a reveal. Wrapping bounds the wait to one band.
 */
export function cascadeBand(row: number, col: number): number {
    return (row + col) % CASCADE_BANDS;
}
