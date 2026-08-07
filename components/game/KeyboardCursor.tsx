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
 * moving it re-renders zero cells (Cell's memo comparator would ignore a cursor
 * prop anyway). Position reuses the measured-geometry technique from the remote
 * cursors — the cell size token is a clamp() and cannot be parsed.
 *
 * The live region announces the selected cell to screen readers in the same
 * words as the cell's own aria-label. It stays mounted even with no cursor, so
 * the first announcement is not lost to a region that appeared with its text.
 */
export default function KeyboardCursor({ boardRef }: KeyboardCursorProps) {
    const kbCursor = useMinesweeperStore((state) => state.kbCursor);
    const board = useMinesweeperStore((state) => state.board);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const mode = useMinesweeperStore((state) => state.mode);
    const pvpWinner = useMinesweeperStore((state) => state.pvpWinner);
    const metrics = useCellMetrics(boardRef);
    const frameRef = useRef<HTMLDivElement>(null);

    // Keeps the cursor visible inside the board's overflow scroll container.
    // Optional call: jsdom renders this component without a scrollIntoView.
    useEffect(() => {
        frameRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [kbCursor]);

    // A cursor left out of bounds by a board change renders nothing; the next
    // movement key clamps it back in bounds.
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
            <div className="sr-only" role="status" aria-live="polite">
                {cell !== undefined && kbCursor !== null
                    ? cellAriaLabel(cell, kbCursor.r, kbCursor.c, minesRevealed)
                    : null}
            </div>
        </>
    );
}
