"use client";

import { useEffect, useState } from 'react';

export interface CellMetrics {
    size: number;
    gap: number;
}

export const DEFAULT_METRICS: CellMetrics = { size: 40, gap: 3 };

/**
 * Measures the board's real geometry: a clamp() custom property is not a
 * length, so `parseFloat` on the token returned NaN and every cursor fell back
 * to 40px. `getComputedStyle().width`, not a rect: cells scale during the cascade.
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

/** Live cell size and gap for anything positioning an overlay on the board. */
export function useCellMetrics(boardRef: React.RefObject<HTMLDivElement | null>): CellMetrics {
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

    return metrics;
}
