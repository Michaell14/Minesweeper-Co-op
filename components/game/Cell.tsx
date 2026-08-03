import React from 'react';
import styles from "./board.module.css";
import { useMinesweeperStore, Cell as CellType } from '@/app/store';
// Direct, not via the @/components/ds barrel: this component renders once per
// cell (256+ on a medium board) and has no business pulling in Dialog, Button
// and the icon sprites to get one class name.
import { pointerClass } from '@/components/ds/pointer';
import { cascadeBand, type CascadeOrigin } from '@/lib/motion';

interface CellParams {
    cell: CellType,
    row: number,
    col: number,
    cascadeOrigin?: CascadeOrigin,
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
    emitCellHover: (row: number, col: number) => void;
}

const Cell = ({ cell, row, col, cascadeOrigin, toggleFlag, openCell, chordCell, emitCellHover }: CellParams) => {
    // Subscribes to hovers on THIS cell only. for...in rather than Object.values
    // so a hot path with 512 instances allocates no array per render.
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

    // One selector per value, so an unrelated write does not re-render the board.
    const bothPressed = useMinesweeperStore((state) => state.bothPressed);
    const isChecked = useMinesweeperStore((state) => state.isChecked);
    const swapButtons = useMinesweeperStore((state) => state.settings.swapMouseButtons);
    const chordingEnabled = useMinesweeperStore((state) => state.settings.chording);
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const mode = useMinesweeperStore((state) => state.mode);
    const pvpStarted = useMinesweeperStore((state) => state.pvpStarted);
    const pvpWinner = useMinesweeperStore((state) => state.pvpWinner);
    const setLeftClick = useMinesweeperStore((state) => state.setLeftClick);
    const setRightClick = useMinesweeperStore((state) => state.setRightClick);
    const setCoord = useMinesweeperStore((state) => state.setCoord);

    const isDisabled = mode === 'pvp' && !pvpStarted;

    /*
     * Whether this board's mines are on show. The server decides it — closed
     * cells report `isMine: false` unless it deliberately revealed them — but
     * the flag is still needed, because a revealed mine is CLOSED and would
     * otherwise render as an ordinary covered square.
     *
     * `gameOver` alone missed the player who lost a RACE: they never hit a mine,
     * so nothing about their own state is over, yet the race is decided and the
     * server has just sent them their board with every mine in it. Reading
     * `gameOver` here rather than `pvpWinner` too is why that board came back
     * looking exactly as it did mid-game.
     */
    const minesRevealed = gameOver || (mode === 'pvp' && pvpWinner !== null);
    const isHovered = cellHover !== null;
    const hoverColor = cellHover?.color || null;

    const hoverStyle = isHovered && hoverColor
        ? ({ '--hover-color': hoverColor } as React.CSSProperties)
        : undefined;

    /*
     * Only revealed cells call this — building the delay for all 512 would be
     * wasted work in the one component with a real render budget.
     *
     * The origin arrives as a PROP rather than through a selector: a subscription
     * would re-run in all 512 cells on every reveal, and `arePropsEqual` ignores
     * it, so only the cells that actually changed read the new one. Those are
     * exactly the cells about to animate; the rest have already swept.
     */
    const revealStyle = (): React.CSSProperties => ({
        ...hoverStyle,
        '--reveal-delay': `calc(var(--ms-cascade-step) * ${cascadeBand(row, col, cascadeOrigin)})`,
    } as React.CSSProperties);

    /*
     * The swap setting exchanges what the two buttons MEAN, not what they do
     * mechanically: chording still needs both buttons and the bothPressed
     * latch, so mousedown keeps recording physical buttons and only the
     * action each release fires is swapped.
     */
    const primaryAction = swapButtons ? toggleFlag : openCell;   // left button
    const secondaryAction = swapButtons ? openCell : toggleFlag; // right button

    const handleMouseEnter = () => {
        emitCellHover(row, col);
    };

    const handleMouseLeave = () => {
        emitCellHover(-1, -1);
    };

    const handleMouseDown = (event: React.MouseEvent) => {
        if (isDisabled) return;

        setCoord(row, col);
        if (event.button === 0) {
            setLeftClick(true);
        } else if (event.button === 1) {
            event.preventDefault(); // middle-click otherwise starts autoscroll
            if (chordingEnabled) chordCell(row, col);
        } else if (event.button === 2) {
            setRightClick(true);
        }
    };

    const handleMouseUp = (event: React.MouseEvent) => {
        if (isDisabled) return;

        if (event.button === 0) {
            if (!bothPressed) {
                primaryAction(row, col);
            }
            setLeftClick(false);

        } else if (event.button === 2) {
            if (!bothPressed) {
                secondaryAction(row, col);
            }
            setRightClick(false);
        }
    };

    const getAriaLabel = () => {
        if (cell.isMine && (cell.isOpen || minesRevealed)) {
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

    if ((cell.isOpen || minesRevealed) && cell.isMine) {
        return <div
            key={col}
            className={`${styles.cell} ${styles.mine} ${isHovered ? styles.hovered : ''}`}
            style={revealStyle()}
            role="gridcell"
            aria-label={getAriaLabel()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            // Suppress middle-click autoscroll.
            onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
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
                style={revealStyle()}
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
                style={hoverStyle}
                /*
                 * Both buttons fire their MAPPED action here; the server's
                 * flag protection makes the open a no-op on a flagged cell, so
                 * whichever button currently means "flag" is the one that
                 * unflags — under swap that is the left button.
                 */
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isDisabled) secondaryAction(row, col);
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                // Suppress middle-click autoscroll.
                onMouseDown={(e) => {
                    if (e.button === 1) e.preventDefault();
                }}>

                <div className="h-full w-full xl:hidden" onClick={() => { if (!isDisabled) { !isChecked ? toggleFlag(row, col) : {} } }}>
                    🚩
                </div>
                <div
                    className="h-full w-full hidden xl:block"
                    onClick={() => { if (!isDisabled) primaryAction(row, col); }}>
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
            // Also what the press state in board.module.css keys off: a board
            // waiting for the race to start must not depress under a click it
            // is going to ignore.
            aria-disabled={isDisabled || undefined}
            className={`${styles.cell} ${styles.closed} ${isHovered ? styles.hovered : ''} ${isDisabled ? 'opacity-50 cursor-not-allowed' : pointerClass}`}
            style={hoverStyle}
            onContextMenu={(e) => {
                e.preventDefault();
                if (!isDisabled) secondaryAction(row, col);
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            // Suppress middle-click autoscroll.
            onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
            }}>
            {/* Mobile taps follow the flag-mode toggle, never the swap setting. */}
            <div className="h-full w-full xl:hidden" onClick={() => { if (!isDisabled) { isChecked ? openCell(row, col) : toggleFlag(row, col) } }} />
            <div className="h-full w-full hidden xl:block" onClick={() => {
                if (!isDisabled) primaryAction(row, col);
            }} />
        </div>
    );
};

Cell.displayName = 'Cell';

/**
 * Re-render only on a real cell-state change. The action props are stable, and
 * `cascadeOrigin` is deliberately not compared: a cell whose state did not
 * change has already swept, and re-rendering it for a new origin would restart
 * its reveal.
 */
const arePropsEqual = (prevProps: CellParams, nextProps: CellParams) => {
    return (
        prevProps.cell.isMine === nextProps.cell.isMine &&
        prevProps.cell.isOpen === nextProps.cell.isOpen &&
        prevProps.cell.isFlagged === nextProps.cell.isFlagged &&
        prevProps.cell.nearbyMines === nextProps.cell.nearbyMines &&
        prevProps.row === nextProps.row &&
        prevProps.col === nextProps.col
    );
};

export default React.memo(Cell, arePropsEqual);
