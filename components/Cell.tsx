import React from 'react';
import styles from "./Home.module.css";
import { useMinesweeperStore } from '@/app/store';

interface CellParams {
    cell: any,
    row: number,
    col: number,
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
}

export default function Cell({ cell, row, col, toggleFlag, openCell }: CellParams) {
    const { gameOver } = useMinesweeperStore();
    if ((cell.isOpen || gameOver) && cell.isMine) {
        return <td key={col} className={`${styles.cell} ${styles.mine}`}>💣</td>;
    }
    if (cell.isOpen) {
        return (
            <td key={col} className={`${styles.cell} ${styles.open}`}>
                {cell.nearbyMines > 0 ? cell.nearbyMines : ''}
            </td>
        );
    }

    if (cell.isFlagged) {
        return (
            <td
                key={col}
                className={`${styles.cell} ${styles.flagged} text-lg`}
                onContextMenu={(e) => {
                    e.preventDefault();
                    toggleFlag(row, col);
                }}>
                🚩
            </td>
        )
    };
    return (
        <td
            key={col}
            className={`${styles.cell} ${styles.closed} nes-pointer `}
            onClick={() => openCell(row, col)}
            onContextMenu={(e) => {
                e.preventDefault();
                toggleFlag(row, col);
            }}
        >
        </td>
    );
}
