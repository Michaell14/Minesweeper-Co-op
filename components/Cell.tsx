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
    chordCell: (row: number, col: number) => void;
}

export default function Cell({ cell, row, col, toggleFlag, openCell, chordCell }: CellParams) {
    const { bothPressed, isChecked, gameOver,
        setLeftClick, setRightClick, setCoord } = useMinesweeperStore();

    const handleMouseDown = (event: any) => {
        setCoord(row, col);
        if (event.button === 0) {
            setLeftClick(true);
        } else if (event.button === 1) {
            // Middle mouse button - chord immediately
            event.preventDefault();
            chordCell(row, col);
        } else if (event.button === 2) {
            setRightClick(true);
        }

    };

    const handleMouseUp = (event: any) => {
        if (event.button === 0) {
            if (!bothPressed) {
                openCell(row, col);
            }
            setLeftClick(false);

        } else if (event.button === 2) {
            if (!bothPressed) {
                toggleFlag(row, col);
            }
            setRightClick(false);
        }
    };

    if ((cell.isOpen || gameOver) && cell.isMine) {
        return <td key={col} className={`${styles.cell} ${styles.mine}`} onMouseDown={(e) => {
            // Prevent middle mouse button default behavior (scrolling)
            if (e.button === 1) {
                e.preventDefault();
            }
        }}>💣</td>;
    }
    if (cell.isOpen) {
        return (
            <td key={col} 
            onContextMenu={(e) => {
                e.preventDefault();
            }} 
            className={`${styles.cell} ${styles.open}`} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
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
                }}
                onMouseDown={(e) => {
                    // Prevent middle mouse button default behavior (scrolling)
                    if (e.button === 1) {
                        e.preventDefault();
                    }
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
            }}
            onMouseDown={(e) => {
                // Prevent middle mouse button default behavior (scrolling)
                if (e.button === 1) {
                    e.preventDefault();
                }
            }}>
            <Box h={"full"} w={"full"} hideFrom={"sm"} onClick={() => { isChecked ? openCell(row, col) : toggleFlag(row, col) }}>

            </Box>
            <Box h={"full"} w={"full"} hideBelow={"sm"} onClick={() => {
                openCell(row, col);
            }}>

            </Box>
        </td>
    );
}