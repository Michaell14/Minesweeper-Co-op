/**
 * The one place that asks whether the user wants motion. CSS covers itself via
 * the duration tokens in app/tokens.css; this is for what CSS cannot reach,
 * like a canvas particle burst.
 */
export function prefersReducedMotion(): boolean {
    // matchMedia is also missing in some embedded webviews; keep the animation there.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Diagonals the cascade reveal repeats over before wrapping. Paired with
 * `--ms-cascade-step` in app/tokens.css: the feel is their product, change both.
 */
export const CASCADE_BANDS = 10;

/** The cell a reveal started from, when one is known. */
export type CascadeOrigin = { row: number; col: number } | null;

/**
 * Which band of the cascade sweep a cell belongs to. Measured from the cell the
 * reveal STARTED at, so the clicked cell is band 0 and the wave sweeps outward;
 * anchoring to the board diagonal put up to CASCADE_BANDS - 1 steps of delay on
 * a single-cell open. The wrap bounds the wait to one band. No origin (a whole
 * board arriving at once) falls back to the diagonal.
 */
export function cascadeBand(row: number, col: number, origin?: CascadeOrigin): number {
    if (!origin) return (row + col) % CASCADE_BANDS;
    return (Math.abs(row - origin.row) + Math.abs(col - origin.col)) % CASCADE_BANDS;
}
