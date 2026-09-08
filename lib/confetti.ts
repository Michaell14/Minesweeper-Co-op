import confetti from 'canvas-confetti';
import { prefersReducedMotion } from '@/lib/motion';
import { useMinesweeperStore } from '@/app/store';

/**
 * Celebration burst, on a win and from the shared confetti button. Skipped
 * under reduced motion: it is the largest motion in the app, and the status
 * badge already announces the win. The settings toggle composes with that,
 * gated here so every caller obeys both. Sending confetti to OTHERS is not
 * gated: each recipient's own setting rules their screen.
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
