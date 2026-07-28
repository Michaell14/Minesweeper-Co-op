import confetti from 'canvas-confetti';

/** Celebration burst used on a win and by the shared confetti button. */
export function shootConfetti(): void {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
}
