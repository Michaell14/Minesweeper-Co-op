"use client";

import React, { useEffect, useRef } from 'react';
import { useMinesweeperStore } from '@/app/store';
import { useCellMetrics } from './useCellMetrics';
import { cellAriaLabel } from './cellLabel';
import styles from './board.module.css';

interface KeyboardCursorProps {
    boardRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The keyboard selection cursor: a cell-sized frame layered over the board, so
 * moving it re-renders zero cells. Positioned from measured geometry like the
 * remote cursors, since the cell size token is a clamp(). The live region
 * stays mounted even with no cursor, so the first announcement is not lost.
 */
export default function KeyboardCursor({ boardRef }: KeyboardCursorProps) {
    const kbCursor = useMinesweeperStore((state) => state.kbCursor);
    const board = useMinesweeperStore((state) => state.board);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const mode = useMinesweeperStore((state) => state.mode);
    const pvpWinner = useMinesweeperStore((state) => state.pvpWinner);
    const metrics = useCellMetrics(boardRef);
    const frameRef = useRef<HTMLDivElement>(null);

    // Keeps the cursor visible inside the scroll container. Optional call: jsdom has no scrollIntoView.
    useEffect(() => {
        frameRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [kbCursor]);

    // A cursor left out of bounds by a board change renders nothing; the next key clamps it.
    const cell = kbCursor === null ? undefined : board[kbCursor.r]?.[kbCursor.c];
    const minesRevealed = gameOver || (mode === 'pvp' && pvpWinner !== null);
    const stride = metrics.size + metrics.gap;

    return (
        <>
            {kbCursor !== null && cell !== undefined && (
                <div
                    ref={frameRef}
                    className={styles.kbCursor}
                    data-kb-cursor
                    aria-hidden="true"
                    style={{
                        transform: `translate(${metrics.gap + kbCursor.c * stride}px, ${metrics.gap + kbCursor.r * stride}px)`,
                        width: metrics.size,
                        height: metrics.size,
                    }}
                />
            )}
            {/* Marked, not found by position: the board carries a second polite
                region for pings, and DOM order would pick whichever mounted first. */}
            <div className="sr-only" role="status" aria-live="polite" data-kb-announcer>
                {cell !== undefined && kbCursor !== null
                    ? cellAriaLabel(cell, kbCursor.r, kbCursor.c, minesRevealed)
                    : null}
            </div>
        </>
    );
}
