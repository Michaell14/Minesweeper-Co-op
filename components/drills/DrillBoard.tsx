import React from 'react';
import styles from '@/components/game/board.module.css';
import type { Coord } from '@/lib/drills';
import { adjacentMines } from '@/lib/drillDeduction';
import DrillCell from './DrillCell';
import type { DrillCellState } from './drillLabel';

export type DrillMarks = DrillCellState[][];

const isCovered = (ch: string) => ch === '#' || ch === '*';

/** Every cell untouched. The layout, not the marks, says what starts open. */
export const initialMarks = (layout: readonly string[]): DrillMarks =>
    layout.map((row) => Array.from(row, () => 'covered' as DrillCellState));

export interface DrillBoardProps {
    layout: readonly string[];
    marks: DrillMarks;
    /** The cell a hint is pointing at, if any. */
    hintAt?: Coord | null;
    onOpen: (row: number, col: number) => void;
    onFlag: (row: number, col: number) => void;
}

export default function DrillBoard({ layout, marks, hintAt, onOpen, onFlag }: DrillBoardProps) {
    const cols = layout.length === 0 ? 0 : layout[0].length;

    return (
        <div
            className={styles.gameBoard}
            style={{ '--board-cols': cols } as React.CSSProperties}
            role="grid"
        >
            {layout.map((row, r) => (
                <div key={r} className={styles.gameRow} role="row">
                    {Array.from(row, (ch, c) => {
                        const covered = isCovered(ch);
                        const state = covered ? marks[r][c] : 'open';
                        const nearby = covered
                            ? adjacentMines(layout, r, c)
                            : (ch === '.' ? 0 : Number(ch));
                        return (
                            <DrillCell
                                key={c}
                                state={state}
                                row={r}
                                col={c}
                                nearby={nearby}
                                hinted={hintAt?.[0] === r && hintAt?.[1] === c}
                                onOpen={onOpen}
                                onFlag={onFlag}
                            />
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
