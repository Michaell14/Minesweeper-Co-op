import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import Cell from '@/components/game/Cell';
import styles from '@/components/game/board.module.css';

export interface BoardProps {
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
    emitCellHover: (row: number, col: number) => void;
    handleBoardLeave: () => void;
}

/**
 * The board itself. Previously this markup existed twice in Grid.tsx, once per
 * layout tree, which is how the two copies drifted apart.
 */
export default function Board({ toggleFlag, openCell, chordCell, emitCellHover, handleBoardLeave }: BoardProps) {
    const board = useMinesweeperStore((state) => state.board);

    return (
        <div
            className={styles.gameBoard}
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
        </div>
    );
}
