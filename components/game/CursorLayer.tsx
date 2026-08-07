import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { useCellMetrics } from './useCellMetrics';
import styles from './board.module.css';

interface CursorLayerProps {
    boardRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Remote co-op cursors, layered over the board. Reuses the cellHover wire
 * protocol — cell-snapped, not pixel-tracked — and animates between cells with a
 * CSS transition rather than a new socket event. The server suppresses hovers in
 * PVP, so this renders nothing there.
 */
export default function CursorLayer({ boardRef }: CursorLayerProps) {
    const playerHovers = useMinesweeperStore((state) => state.playerHovers);
    const metrics = useCellMetrics(boardRef);

    const hovers = Object.entries(playerHovers);
    if (hovers.length === 0) return null;

    const stride = metrics.size + metrics.gap;
    // The board's own padding equals --cell-gap, so cell (0,0) starts one gap in.
    const cellCenter = (index: number) => metrics.gap + index * stride + metrics.size / 2;

    return (
        <div className={styles.cursorLayer} aria-hidden="true">
            {hovers.map(([id, hover]) => (
                <div
                    key={id}
                    className={styles.remoteCursor}
                    style={{
                        transform: `translate(${cellCenter(hover.col)}px, ${cellCenter(hover.row)}px) translate(-50%, -50%)`,
                        '--cursor-color': hover.color,
                    } as React.CSSProperties}
                >
                    <span className={styles.cursorLabel}>{hover.name}</span>
                    <span className={styles.cursorGlyph} />
                </div>
            ))}
        </div>
    );
}
