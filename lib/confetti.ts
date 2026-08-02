import confetti from 'canvas-confetti';
import { prefersReducedMotion } from '@/lib/motion';

/**
 * Celebration burst used on a win and by the shared confetti button.
 *
 * Skipped entirely under reduced motion — it is the largest piece of motion in
 * the app and has no smaller version worth showing. The status badge and live
 * region already announce the win, so only the flourish is lost.
 */
export function shootConfetti(): void {
    if (prefersReducedMotion()) return;

    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
}
