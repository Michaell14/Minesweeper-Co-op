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

/** The cell a reveal started from, when one is known. */
export type CascadeOrigin = { row: number; col: number } | null;

/**
 * Which band of the cascade sweep a cell belongs to.
 *
 * Measured from the cell the reveal STARTED at, so the clicked cell is always
 * band 0 and the wave sweeps outward from the player's finger. Anchoring it to
 * the board diagonal instead put up to CASCADE_BANDS - 1 steps of delay on a
 * single-cell open — ~126ms at the current step, varying with (row + col), which
 * read as inconsistent lag on top of the server round trip rather than as motion.
 *
 * The wrap is still the point: without it a cascade mid-board waited for its
 * absolute distance before any cell appeared. Wrapping bounds the wait to one band.
 *
 * No origin means no single cell started it — a whole board arriving at once, as
 * on a game-over reveal — and the diagonal is the right ramp for that.
 */
export function cascadeBand(row: number, col: number, origin?: CascadeOrigin): number {
    if (!origin) return (row + col) % CASCADE_BANDS;
    return (Math.abs(row - origin.row) + Math.abs(col - origin.col)) % CASCADE_BANDS;
}
