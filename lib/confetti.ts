import confetti from 'canvas-confetti';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * Celebration burst used on a win and by the shared confetti button.
 *
 * Skipped entirely when the user has asked for reduced motion. A hundred
 * particles thrown across the whole viewport is the single largest piece of
 * motion in the app, and there is no smaller version of it worth showing — the
 * win is already announced by the status badge and the live region, so nothing
 * is lost but the flourish.
 */
export function shootConfetti(): void {
    if (prefersReducedMotion()) return;

    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
}
