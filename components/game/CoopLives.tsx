import React from 'react';
import { useMinesweeperStore } from '@/app/store';

export interface CoopLivesProps {
    className?: string;
}

/**
 * The shared-life count in a three-life co-op room, with a nudge once one has
 * gone. Desktop shows it in the banner above the board. Mobile shows it BELOW
 * the board, beside the PVP progress bars: the sticky HUD has no width to
 * spare at 375px, and a line above the board there pushes a 16x16 game off the
 * first screen (`mobileFit` in scripts/ui-smoke/run.js measures the chrome).
 */
export default function CoopLives({ className = '' }: CoopLivesProps) {
    const relaxed = useMinesweeperStore((state) => state.relaxed);
    const lives = useMinesweeperStore((state) => state.livesRemaining);
    const mode = useMinesweeperStore((state) => state.mode);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const gameWon = useMinesweeperStore((state) => state.gameWon);

    if (mode !== 'co-op' || !relaxed) return null;

    return (
        <p className={`text-pixel-xs text-center m-0 ${className}`} role="status" aria-live="polite">
            <strong>Standard · {lives} / 3 shared lives</strong>
            {!gameOver && !gameWon && lives < 3 && (
                <span className="block text-ink-muted mt-1">Mine uncovered. Keep sweeping together!</span>
            )}
        </p>
    );
}
