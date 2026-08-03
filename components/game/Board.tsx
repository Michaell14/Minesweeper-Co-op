import React, { useRef } from 'react';
import { useMinesweeperStore } from '@/app/store';
import Cell from '@/components/game/Cell';
import CursorLayer from '@/components/game/CursorLayer';
import styles from '@/components/game/board.module.css';

export interface BoardProps {
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
    emitCellHover: (row: number, col: number) => void;
    handleBoardLeave: () => void;
}

/** The board itself. Mounted exactly once — see Grid.tsx. */
export default function Board({ toggleFlag, openCell, chordCell, emitCellHover, handleBoardLeave }: BoardProps) {
    const board = useMinesweeperStore((state) => state.board);
    const cellSize = useMinesweeperStore((state) => state.settings.cellSize);
    const boardRef = useRef<HTMLDivElement>(null);
    const cols = board[0]?.length || 0;

    return (
        <div
            ref={boardRef}
            className={styles.gameBoard}
            /* Picks the cell-size CEILING; the stylesheet's fit clamp still rules. */
            data-cell-size={cellSize}
            /* The stylesheet sizes cells to fit; only this component knows the shape. */
            style={{ '--board-cols': cols } as React.CSSProperties}
            onMouseLeave={handleBoardLeave}
            role="grid"
            aria-label={`Minesweeper game board, ${board.length} rows by ${board[0]?.length || 0} columns`}>
            {board.map((row, rowIndex: number) => (
                <div key={rowIndex} className={styles.gameRow} role="row">
                    {row.map((cell, colIndex: number) => (
                        <Cell
                            key={colIndex}
                            cell={cell}
                            row={rowIndex}
                            col={colIndex}
                            toggleFlag={toggleFlag}
                            openCell={openCell}
                            chordCell={chordCell}
                            emitCellHover={emitCellHover} />
                    ))}
                </div>
            ))}
            <CursorLayer boardRef={boardRef} />
        </div>
    );
}
