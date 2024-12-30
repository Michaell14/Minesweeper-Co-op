import React from 'react';
import styles from "./Home.module.css";
import { useMinesweeperStore } from '@/app/store';
import { Box } from "@chakra-ui/react";


interface CellParams {
    cell: any,
    row: number,
    col: number,
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
}

export default function Cell({ cell, row, col, toggleFlag, openCell }: CellParams) {
    const { isChecked, gameOver } = useMinesweeperStore();
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

                <Box h={"full"} w={"full"} hideFrom={"sm"} onClick={() => { !isChecked ? toggleFlag(row, col) : {} }}>
                    🚩
                </Box>
                <Box h={"full"} w={"full"} hideBelow={"sm"}>
                    🚩
                </Box>
            </td>
        )
    };
    return (

        <td
            key={col}
            className={`${styles.cell} ${styles.closed} nes-pointer `}
            onContextMenu={(e) => {
                e.preventDefault();
                toggleFlag(row, col);
            }}>
            <Box h={"full"} w={"full"} hideFrom={"sm"} onClick={() => { isChecked ? openCell(row, col) : toggleFlag(row, col) }}>

            </Box>
            <Box h={"full"} w={"full"} hideBelow={"sm"} onClick={() => openCell(row, col)}>

            </Box>
        </td>
    );
}
