import React from 'react';
import styles from "./board.module.css";
import { useMinesweeperStore, Cell as CellType } from '@/app/store';
// Direct, not via the @/components/ds barrel: this component renders once per
// cell (256+ on a medium board) and has no business pulling in Dialog, Button
// and the icon sprites to get one class name.
import { pointerClass } from '@/components/ds/pointer';


/**
 * How many diagonals the cascade sweep repeats over. Ten at 14ms is a ~140ms
 * cycle: long enough to read as a wave, short enough that the first cell is
 * always on screen within one step.
 */
const CASCADE_BANDS = 10;

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
    // Optimization: Use for...in loop to avoid Object.values() array allocation
    // and return immediately on find (faster than filter)
    const cellHover = useMinesweeperStore((state) => {
        const hovers = state.playerHovers;
        for (const key in hovers) {
            const hover = hovers[key];
            if (hover.row === row && hover.col === col) {
                return hover;
            }
        }
        return null;
    });
    
    // Subscribe to other store values separately to avoid unnecessary re-renders
    const bothPressed = useMinesweeperStore((state) => state.bothPressed);
    const isChecked = useMinesweeperStore((state) => state.isChecked);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const mode = useMinesweeperStore((state) => state.mode);
    const pvpStarted = useMinesweeperStore((state) => state.pvpStarted);
    const setLeftClick = useMinesweeperStore((state) => state.setLeftClick);
    const setRightClick = useMinesweeperStore((state) => state.setRightClick);
    const setCoord = useMinesweeperStore((state) => state.setCoord);

    // Disable cell interaction in PVP mode before game starts
    const isDisabled = mode === 'pvp' && !pvpStarted;

    // Check if any player is hovering over this cell
    const isHovered = cellHover !== null;
    const hoverColor = cellHover?.color || null;

    /*
     * Style for a revealed cell: the remote-cursor colour when someone is on
     * it, plus this cell's offset in the cascade sweep.
     *
     * The offset is the cell's position along the board diagonal, wrapped every
     * CASCADE_BANDS cells. Wrapping is the important part. Using the raw
     * diagonal meant a cascade in the middle of the board waited for its
     * absolute index before ANY cell appeared — measured at ~240ms of nothing,
     * which reads as lag rather than as a reveal. Wrapping bounds the wait to
     * one band no matter where on the board the cascade happens.
     *
     * It also needs nothing from the store: a teammate's cascade sweeps just as
     * well, and no cell has to subscribe to the last-clicked coordinate — which
     * would re-render all 256 of them on every mousedown.
     */
    const revealStyle = {
        ...(isHovered && hoverColor ? { '--hover-color': hoverColor } : {}),
        '--reveal-delay': `calc(var(--ms-cascade-step) * ${(row + col) % CASCADE_BANDS})`,
    } as React.CSSProperties;

    const handleMouseEnter = () => {
        emitCellHover(row, col);
    };

    const handleMouseLeave = () => {
        emitCellHover(-1, -1); // Signal "no hover"
    };

    const handleMouseDown = (event: React.MouseEvent) => {
        if (isDisabled) return; // Prevent interaction before PVP starts

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
        if (isDisabled) return; // Prevent interaction before PVP starts

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
            style={revealStyle}
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
                style={revealStyle}
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
                className={`${styles.cell} ${styles.flagged} ${isHovered ? styles.hovered : ''} text-pixel-lg`}
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

                <div className="h-full w-full xl:hidden" onClick={() => { if (!isDisabled) { !isChecked ? toggleFlag(row, col) : {} } }}>
                    🚩
                </div>
                <div className="h-full w-full hidden xl:block">
                    🚩
                </div>
            </div>
        );
    }

    return (

        <div
            key={col}
            role="gridcell"
            aria-label={getAriaLabel()}
            className={`${styles.cell} ${styles.closed} ${isHovered ? styles.hovered : ''} ${isDisabled ? 'opacity-50 cursor-not-allowed' : pointerClass}`}
            style={isHovered && hoverColor ? { '--hover-color': hoverColor } as React.CSSProperties : undefined}
            onContextMenu={(e) => {
                e.preventDefault();
                if (!isDisabled) toggleFlag(row, col);
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={(e) => {
                // Prevent middle mouse button default behavior (scrolling)
                if (e.button === 1) {
                    e.preventDefault();
                }
            }}>
            <div className="h-full w-full xl:hidden" onClick={() => { if (!isDisabled) { isChecked ? openCell(row, col) : toggleFlag(row, col) } }} />
            <div className="h-full w-full hidden xl:block" onClick={() => {
                if (!isDisabled) openCell(row, col);
            }} />
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
