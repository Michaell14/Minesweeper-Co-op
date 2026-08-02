import React, { useEffect, useState } from 'react';
import { useMinesweeperStore } from '@/app/store';
import styles from './board.module.css';

interface CellMetrics {
    size: number;
    gap: number;
}

const DEFAULT_METRICS: CellMetrics = { size: 40, gap: 3 };

/**
 * Measures the board's real geometry rather than reading the size tokens.
 *
 * Custom properties compute to a token sequence, not a length, so once
 * --cell-size became a clamp(), `parseFloat` on it returned NaN and every cursor
 * silently fell back to 40px. Measuring a real cell is immune to that.
 *
 * `getComputedStyle().width`, not `getBoundingClientRect()`: cells carry a scale
 * transform during the cascade reveal, and a rect reports the animating size.
 */
const readCellMetrics = (board: HTMLElement): CellMetrics => {
    const cell = board.querySelector('[role="gridcell"]');
    if (!cell) return DEFAULT_METRICS;

    const size = parseFloat(getComputedStyle(cell).width);
    const gap = parseFloat(getComputedStyle(board).columnGap);
    return {
        size: Number.isFinite(size) ? size : DEFAULT_METRICS.size,
        gap: Number.isFinite(gap) ? gap : DEFAULT_METRICS.gap,
    };
};

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
    const [metrics, setMetrics] = useState<CellMetrics>(DEFAULT_METRICS);

    useEffect(() => {
        const board = boardRef.current;
        if (!board) return;

        const updateMetrics = () => setMetrics(readCellMetrics(board));
        updateMetrics();

        const observer = new ResizeObserver(updateMetrics);
        observer.observe(board);
        return () => observer.disconnect();
    }, [boardRef]);

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
