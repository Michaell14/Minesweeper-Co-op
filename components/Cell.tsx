import React from 'react';
import styles from "./Home.module.css";
import { useMinesweeperStore, Cell as CellType } from '@/app/store';
import { Box } from "@chakra-ui/react";


interface CellParams {
    cell: CellType,
    row: number,
    col: number,
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
}

const Cell = React.memo(({ cell, row, col, toggleFlag, openCell, chordCell }: CellParams) => {
    const { bothPressed, isChecked, gameOver,
        setLeftClick, setRightClick, setCoord } = useMinesweeperStore();

    const handleMouseDown = (event: React.MouseEvent) => {
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

    const handleMouseUp = (event: React.MouseEvent) => {
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

    // Generate accessible label for screen readers
    const getAriaLabel = () => {
        if (cell.isMine && (cell.isOpen || gameOver)) {
            return `Mine at row ${row + 1}, column ${col + 1}`;
        }
        if (cell.isOpen) {
            return cell.nearbyMines > 0
                ? `Revealed cell at row ${row + 1}, column ${col + 1}, ${cell.nearbyMines} nearby ${cell.nearbyMines === 1 ? 'mine' : 'mines'}`
                : `Empty cell at row ${row + 1}, column ${col + 1}`;
        }
        if (cell.isFlagged) {
            return `Flagged cell at row ${row + 1}, column ${col + 1}`;
        }
        return `Unrevealed cell at row ${row + 1}, column ${col + 1}`;
    };

    if ((cell.isOpen || gameOver) && cell.isMine) {
        return <div
            key={col}
            className={`${styles.cell} ${styles.mine}`}
            role="gridcell"
            aria-label={getAriaLabel()}
            onMouseDown={(e) => {
                // Prevent middle mouse button default behavior (scrolling)
                if (e.button === 1) {
                    e.preventDefault();
                }
            }}>💣</div>;
    }
    if (cell.isOpen) {
        const numClass = cell.nearbyMines > 0 ? styles[`num${cell.nearbyMines}`] : '';
        return (
            <div
                key={col}
                role="gridcell"
                aria-label={getAriaLabel()}
                onContextMenu={(e) => {
                    e.preventDefault();
                }}
                className={`${styles.cell} ${styles.open} ${numClass}`}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}>
                {cell.nearbyMines > 0 ? cell.nearbyMines : ''}
            </div>
        );
    }

    if (cell.isFlagged) {
        return (
            <div
                key={col}
                role="gridcell"
                aria-label={getAriaLabel()}
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
            </div>
        );
    }

    return (

        <div
            key={col}
            role="gridcell"
            aria-label={getAriaLabel()}
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
        </div>
    );
});

Cell.displayName = 'Cell';

export default Cell;