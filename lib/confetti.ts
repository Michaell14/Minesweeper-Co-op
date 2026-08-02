import confetti from 'canvas-confetti';
import { prefersReducedMotion } from '@/lib/motion';
import { useMinesweeperStore } from '@/app/store';

/**
 * Celebration burst used on a win and by the shared confetti button.
 *
 * Skipped entirely under reduced motion — it is the largest piece of motion in
 * the app and has no smaller version worth showing. The status badge and live
 * region already announce the win, so only the flourish is lost.
 *
 * The settings toggle composes with that rather than replacing it: either one
 * suppresses the burst, and the gate lives here so every caller — your own
 * win, a teammate's shared burst — obeys both. Sending confetti to OTHERS is
 * not gated: the setting is about your screen, and each recipient's own
 * setting rules theirs.
 */
export function shootConfetti(): void {
    if (prefersReducedMotion()) return;
    if (!useMinesweeperStore.getState().settings.confetti) return;

    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
}
