/**
 * Minimal typings for canvas-confetti, which ships no declarations. Local rather
 * than @types/canvas-confetti for one call site; widen it here as needed.
 */
declare module 'canvas-confetti' {
    interface ConfettiOptions {
        particleCount?: number;
        angle?: number;
        spread?: number;
        startVelocity?: number;
        decay?: number;
        gravity?: number;
        ticks?: number;
        origin?: { x?: number; y?: number };
        colors?: string[];
        shapes?: string[];
        scalar?: number;
        zIndex?: number;
        disableForReducedMotion?: boolean;
    }

    function confetti(options?: ConfettiOptions): Promise<null> | null;

    export default confetti;
}
