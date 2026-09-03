import React from 'react';
import styles from "./board.module.css";
import { useMinesweeperStore, Cell as CellType } from '@/app/store';
// Direct, not via the ds barrel: 256+ instances have no business pulling in
// Dialog and Button for one class name.
import { pointerClass } from '@/components/ds/pointer';
import Sprite from '@/components/ds/sprites';
import { cascadeBand, type CascadeOrigin } from '@/lib/motion';
import { cellAriaLabel } from './cellLabel';

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
    // Hovers on THIS cell only. for...in so 512 instances allocate no array per render.
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

    // One selector per value so an unrelated write does not re-render the
    // board. Only state that changes the cell's LOOK is subscribed; handler-only
    // state (bothPressed, isChecked, swap, chording) is read from getState().
    const gameOver = useMinesweeperStore((state) => state.gameOver);
    const mode = useMinesweeperStore((state) => state.mode);
    const pvpStarted = useMinesweeperStore((state) => state.pvpStarted);
    const pvpWinner = useMinesweeperStore((state) => state.pvpWinner);

    const isDisabled = mode === 'pvp' && !pvpStarted;

    /*
     * Whether mines are on show. The server decides (closed cells report
     * `isMine: false` unless revealed), but a revealed mine is CLOSED and would
     * otherwise render covered. `gameOver` alone missed the player who lost a
     * RACE: nothing in their own state is over, yet their mines were sent.
     */
    const minesRevealed = gameOver || (mode === 'pvp' && pvpWinner !== null);
    const isHovered = cellHover !== null;
    const hoverColor = cellHover?.color || null;

    const hoverStyle = isHovered && hoverColor
        ? ({ '--hover-color': hoverColor } as React.CSSProperties)
        : undefined;

    /*
     * Only revealed cells call this; building the delay for all 512 is wasted.
     * The origin is a PROP, not a selector: a subscription would re-run in every
     * cell on each reveal, and `arePropsEqual` ignores it so only changed cells
     * (the ones about to animate) read the new one.
     */
    const revealStyle = (): React.CSSProperties => ({
        ...hoverStyle,
        '--reveal-delay': `calc(var(--ms-cascade-step) * ${cascadeBand(row, col, cascadeOrigin)})`,
    } as React.CSSProperties);

    /*
     * The swap setting exchanges what the buttons MEAN, not their mechanics:
     * chording still needs both buttons, so mousedown records physical buttons
     * and only the action each release fires is swapped.
     */
    const primaryAction = (r: number, c: number) => {   // left button
        if (useMinesweeperStore.getState().settings.swapMouseButtons) toggleFlag(r, c);
        else openCell(r, c);
    };
    const secondaryAction = (r: number, c: number) => { // right button
        if (useMinesweeperStore.getState().settings.swapMouseButtons) openCell(r, c);
        else toggleFlag(r, c);
    };

    /*
     * The button that OPENS. The press affordance follows the action, so under
     * swap it is the right button: a cell that sinks and then takes a flag
     * misleads. Plain `:active` cannot ask which button is down.
     */
    const isOpenButton = (button: number) =>
        button === (useMinesweeperStore.getState().settings.swapMouseButtons ? 2 : 0);

    /*
     * Written straight to the DOM: a press must not cost a render across 512
     * instances, and the attribute exists only for the stylesheet.
     */
    const releasePress = (event: React.MouseEvent<HTMLElement>) => {
        delete event.currentTarget.dataset.pressed;
    };

    const handleMouseEnter = () => {
        emitCellHover(row, col);
    };

    /*
     * Every branch wires this, which bounds how long a stray press mark can
     * outlive its press when the cell changes branch mid-press.
     */
    const handleMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
        releasePress(event);
        emitCellHover(-1, -1);
    };

    const handleMouseDown = (event: React.MouseEvent) => {
        if (isDisabled) return;

        const state = useMinesweeperStore.getState();
        state.setCoord(row, col);
        if (event.button === 0) {
            state.setLeftClick(true);
        } else if (event.button === 1) {
            event.preventDefault(); // middle-click otherwise starts autoscroll
            if (state.settings.chording) chordCell(row, col);
        } else if (event.button === 2) {
            state.setRightClick(true);
        }
    };

    // Only on the opened-cell branch, where both mapped actions are server
    // no-ops, which frees the secondary click below.
    const handleMouseUp = (event: React.MouseEvent) => {
        if (isDisabled) return;

        const state = useMinesweeperStore.getState();
        if (event.button === 0) {
            if (!state.bothPressed) {
                primaryAction(row, col);
            }
            state.setLeftClick(false);

        } else if (event.button === 2) {
            if (!state.bothPressed) {
                /*
                 * The only chord gesture a trackpad can make. On release, not
                 * `contextmenu`: macOS raises that on mousedown, so a
                 * right-then-left chord would fire twice.
                 */
                if (state.settings.chording) {
                    chordCell(row, col);
                } else {
                    secondaryAction(row, col);
                }
            }
            state.setRightClick(false);
        }
    };

    const getAriaLabel = () => cellAriaLabel(cell, row, col, minesRevealed);

    /*
     * <Sprite> is a two-node <use> of art mounted once in the layout, so the
     * palette can swap mine and flag without re-rendering a cell.
     */
    if ((cell.isOpen || minesRevealed) && cell.isMine) {
        return <div
            key={col}
            className={`${styles.cell} ${styles.mine} ${isHovered ? styles.hovered : ''}`}
            style={revealStyle()}
            role="gridcell"
            /* Read by the board's ping interception, see Board.tsx. */
            data-row={row}
            data-col={col}
            aria-label={getAriaLabel()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            // Suppress middle-click autoscroll.
            onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
            }}>
            <Sprite kind="mine" className={styles.cellSprite} />
        </div>;
    }
    if (cell.isOpen) {
        const numClass = cell.nearbyMines > 0 ? styles[`num${cell.nearbyMines}`] : '';
        return (
            <div
                key={col}
                role="gridcell"
                /* Read by the board's ping interception, see Board.tsx. */
                data-row={row}
                data-col={col}
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
                /* Read by the board's ping interception, see Board.tsx. */
                data-row={row}
                data-col={col}
                aria-label={getAriaLabel()}
                className={`${styles.cell} ${styles.flagged} ${isHovered ? styles.hovered : ''}`}
                style={hoverStyle}
                /*
                 * Both buttons fire their MAPPED action; the server's flag
                 * protection makes the open a no-op, so whichever button means
                 * "flag" is the one that unflags.
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

                <Sprite kind="flag" className={styles.cellSprite} />
                <div className="h-full w-full xl:hidden" onClick={() => {
                    if (!isDisabled && !useMinesweeperStore.getState().isChecked) toggleFlag(row, col);
                }} />
                <div
                    className="h-full w-full hidden xl:block"
                    onClick={() => { if (!isDisabled) primaryAction(row, col); }} />
            </div>
        );
    }

    return (

        <div
            key={col}
            role="gridcell"
            /* Read by the board's ping interception, see Board.tsx. */
            data-row={row}
            data-col={col}
            aria-label={getAriaLabel()}
            // Also keys the press state in board.module.css: a board waiting
            // for the race must not depress.
            aria-disabled={isDisabled || undefined}
            className={`${styles.cell} ${styles.closed} ${isHovered ? styles.hovered : ''} ${isDisabled ? 'opacity-50 cursor-not-allowed' : pointerClass}`}
            style={hoverStyle}
            onContextMenu={(e) => {
                e.preventDefault();
                if (!isDisabled) secondaryAction(row, col);
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault(); // middle-click starts autoscroll
                if (isOpenButton(e.button) && !isDisabled) e.currentTarget.dataset.pressed = '';
            }}
            onMouseUp={releasePress}>
            {/* Mobile taps follow the flag-mode toggle, never the swap setting. */}
            <div className="h-full w-full xl:hidden" onClick={() => {
                if (isDisabled) return;
                if (useMinesweeperStore.getState().isChecked) openCell(row, col);
                else toggleFlag(row, col);
            }} />
            <div className="h-full w-full hidden xl:block" onClick={() => {
                if (!isDisabled) primaryAction(row, col);
            }} />
        </div>
    );
};

Cell.displayName = 'Cell';

/**
 * Re-render only on a real cell-state change. `cascadeOrigin` is not compared:
 * an unchanged cell has already swept, and a new origin would restart its reveal.
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
