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
    emitCellHover: (row: number, col: number) => void;
}

const Cell = ({ cell, row, col, toggleFlag, openCell, chordCell, emitCellHover }: CellParams) => {
    // Use Zustand selector to only subscribe to hovers for THIS specific cell
    // This prevents re-renders when other cells are hovered
    const cellHover = useMinesweeperStore((state) => {
        const hovers = Object.values(state.playerHovers).filter(
            hover => hover.row === row && hover.col === col
        );
        // Return first hover or null
        return hovers.length > 0 ? hovers[0] : null;
    });
    
    // Subscribe to other store values separately to avoid unnecessary re-renders
    const bothPressed = useMinesweeperStore((state) => state.bothPressed);
    const isChecked = useMinesweeperStore((state) => state.isChecked);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const setLeftClick = useMinesweeperStore((state) => state.setLeftClick);
    const setRightClick = useMinesweeperStore((state) => state.setRightClick);
    const setCoord = useMinesweeperStore((state) => state.setCoord);

    // Check if any player is hovering over this cell
    const isHovered = cellHover !== null;
    const hoverColor = cellHover?.color || null;

    const handleMouseEnter = () => {
        emitCellHover(row, col);
    };

    const handleMouseLeave = () => {
        emitCellHover(-1, -1); // Signal "no hover"
    };

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
            className={`${styles.cell} ${styles.mine} ${isHovered ? styles.hovered : ''}`}
            style={isHovered && hoverColor ? { '--hover-color': hoverColor } as React.CSSProperties : undefined}
            role="gridcell"
            aria-label={getAriaLabel()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
                className={`${styles.cell} ${styles.open} ${numClass} ${isHovered ? styles.hovered : ''}`}
                style={isHovered && hoverColor ? { '--hover-color': hoverColor } as React.CSSProperties : undefined}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
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
                className={`${styles.cell} ${styles.flagged} ${isHovered ? styles.hovered : ''} text-lg`}
                style={isHovered && hoverColor ? { '--hover-color': hoverColor } as React.CSSProperties : undefined}
                onContextMenu={(e) => {
                    e.preventDefault();
                    toggleFlag(row, col);
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
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
            className={`${styles.cell} ${styles.closed} ${isHovered ? styles.hovered : ''} nes-pointer `}
            style={isHovered && hoverColor ? { '--hover-color': hoverColor } as React.CSSProperties : undefined}
            onContextMenu={(e) => {
                e.preventDefault();
                toggleFlag(row, col);
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
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
};

Cell.displayName = 'Cell';

// Custom comparison function for React.memo
// Only re-render if cell state actually changes
const arePropsEqual = (prevProps: CellParams, nextProps: CellParams) => {
    return (
        prevProps.cell.isMine === nextProps.cell.isMine &&
        prevProps.cell.isOpen === nextProps.cell.isOpen &&
        prevProps.cell.isFlagged === nextProps.cell.isFlagged &&
        prevProps.cell.nearbyMines === nextProps.cell.nearbyMines &&
        prevProps.row === nextProps.row &&
        prevProps.col === nextProps.col
        // Note: Functions (toggleFlag, openCell, etc.) are stable and don't need comparison
    );
};

export default React.memo(Cell, arePropsEqual);
