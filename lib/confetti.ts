import { prefersReducedMotion } from '@/lib/motion';
import { useMinesweeperStore } from '@/app/store';

type Confetti = typeof import('canvas-confetti').default;

/*
 * The library is fetched on demand rather than shipped with the game page: a
 * burst is only ever wanted after a win, or when a teammate presses the button.
 * `webpackPrefetch` still pulls it down at idle priority once the game code
 * loads, so the first win does not wait on the network.
 */
let library: Promise<Confetti> | null = null;
const loadConfetti = (): Promise<Confetti> =>
    (library ??= import(/* webpackPrefetch: true */ 'canvas-confetti').then((m) => m.default));

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

    loadConfetti()
        .then((confetti) => confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
        }))
        .catch(() => {
            // A chunk that failed to load costs this burst only; the next one retries.
            library = null;
        });
}
