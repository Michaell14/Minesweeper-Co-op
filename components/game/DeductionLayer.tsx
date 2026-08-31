"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import type { Coord } from '@/lib/drills';
import { useCellMetrics } from './useCellMetrics';
import styles from './board.module.css';

interface DeductionLayerProps {
    boardRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The deduction a lost daily run missed, drawn over the finished board.
 *
 * An overlay rather than cell props: a board holds up to 512 memoized cells,
 * and marking three of them is not worth a prop on every one. Same measured
 * geometry as CursorLayer — the cell size token is a clamp() and cannot be
 * parsed.
 */
export default function DeductionLayer({ boardRef }: DeductionLayerProps) {
    const diagnosis = useMinesweeperStore((state) => state.dailyDiagnosis);
    const metrics = useCellMetrics(boardRef);

    if (!diagnosis) return null;

    const stride = metrics.size + metrics.gap;
    // The board's own padding equals --cell-gap, so cell (0,0) starts one gap in.
    const box = ([r, c]: Coord) => ({
        transform: `translate(${metrics.gap + c * stride}px, ${metrics.gap + r * stride}px)`,
        width: metrics.size,
        height: metrics.size,
    });

    return (
        <div className={styles.deductionLayer} data-deduction-layer aria-hidden="true">
            {diagnosis.clues.map(([r, c]) => (
                <div
                    key={`${r},${c}`}
                    className={styles.deductionClue}
                    data-deduction="clue"
                    style={box([r, c])}
                />
            ))}
            <div
                className={`${styles.deductionTarget} ${diagnosis.verdict === 'mine' ? styles.deductionTargetMine : styles.deductionTargetSafe}`}
                data-deduction="target"
                style={box(diagnosis.target)}
            />
        </div>
    );
}
