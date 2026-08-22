import React, { useRef } from 'react';
import { useMinesweeperStore } from '@/app/store';
import Cell from '@/components/game/Cell';
import CursorLayer from '@/components/game/CursorLayer';
import PingLayer from '@/components/game/PingLayer';
import KeyboardCursor from '@/components/game/KeyboardCursor';
import styles from '@/components/game/board.module.css';

export interface BoardProps {
    toggleFlag: (row: number, col: number) => void;
    openCell: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
    emitCellHover: (row: number, col: number) => void;
    /** Omitted where there is nobody to point at — the daily is single-player. */
    pingCell?: (row: number, col: number) => void;
    handleBoardLeave: () => void;
}

/** The board itself. Mounted exactly once — see Grid.tsx. */
export default function Board({ toggleFlag, openCell, chordCell, emitCellHover, pingCell, handleBoardLeave }: BoardProps) {
    const board = useMinesweeperStore((state) => state.board);
    const cellSize = useMinesweeperStore((state) => state.settings.cellSize);
    // Costs no extra render: it only ever changes alongside the board itself.
    const cascadeOrigin = useMinesweeperStore((state) => state.cascadeOrigin);
    const boardRef = useRef<HTMLDivElement>(null);
    const cols = board[0]?.length || 0;

    /*
     * Ping interception, in the CAPTURE phase on the grid rather than in Cell.
     *
     * Cell has four render branches and acts from four different handlers
     * (onClick on two inner divs, onMouseUp on an opened cell, onContextMenu on
     * a flagged one), so a modifier check per branch is four chances to miss
     * one — and a missed branch means a ping that opens a mine instead. Here it
     * is one listener, ahead of all of them, on the component that is mounted
     * once rather than 512 times.
     *
     * `mousedown` is what has to be swallowed, not `click`: the opened-cell
     * branch acts on mouse UP, so a handler that waited for the click would
     * fire after the chord it was trying to replace.
     */
    const takeoverForPing = (event: React.MouseEvent): boolean => {
        if (event.button !== 0 || !pingCell) return false;
        const { pingArmed, mode } = useMinesweeperStore.getState();
        // Shift is the desktop shortcut; the tray's one-shot arm is the path
        // that also works on a touch screen. See useKeyboardControls for the
        // third one.
        if (!pingArmed && !event.shiftKey) return false;
        // Nothing to point at in a race — and the server would refuse it.
        if (mode === 'pvp') return false;
        return (event.target as Element | null)?.closest('[role="gridcell"]') !== null;
    };

    /*
     * Whether the gesture IN PROGRESS belongs to the ping.
     *
     * A latch rather than re-deciding per event, because the arm is one-shot
     * and clears the moment the ping is sent — by mouseup, `pingArmed` is
     * already false, so a mouseup and click that asked the same question again
     * would answer "no" and hand the cell back to its own handlers. Which is
     * exactly what happened: the ping fired AND the cell opened under it.
     * Caught by the smoke suite, not by the unit tests, whose mock `pingCell`
     * had no reason to disarm anything.
     */
    const pingGesture = useRef(false);

    const onPointerCapture = (event: React.MouseEvent) => {
        // Cleared first, so a latch left behind by a press that never finished
        // (the pointer left the cell before release) cannot outlive this one.
        pingGesture.current = false;
        if (!takeoverForPing(event)) return;
        const cell = (event.target as Element).closest('[role="gridcell"]') as HTMLElement;
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        // Stop the cell's own handlers, and the text selection a shift-click
        // would otherwise start.
        event.preventDefault();
        event.stopPropagation();
        pingGesture.current = true;
        if (Number.isInteger(row) && Number.isInteger(col)) pingCell?.(row, col);
    };

    /* The rest of the gesture, swallowed so nothing downstream sees half of it. */
    const swallowIfPinging = (event: React.MouseEvent) => {
        if (!pingGesture.current) return;
        // The click is the last of the three; the gesture ends with it.
        if (event.type === 'click') pingGesture.current = false;
        event.preventDefault();
        event.stopPropagation();
    };

    return (
        <div
            ref={boardRef}
            className={styles.gameBoard}
            /* Picks the cell-size CEILING; the stylesheet's fit clamp still rules. */
            data-cell-size={cellSize}
            /* The stylesheet sizes cells to fit; only this component knows the shape. */
            style={{ '--board-cols': cols } as React.CSSProperties}
            onMouseLeave={handleBoardLeave}
            onMouseDownCapture={onPointerCapture}
            onMouseUpCapture={swallowIfPinging}
            onClickCapture={swallowIfPinging}
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
                            cascadeOrigin={cascadeOrigin}
                            toggleFlag={toggleFlag}
                            openCell={openCell}
                            chordCell={chordCell}
                            emitCellHover={emitCellHover} />
                    ))}
                </div>
            ))}
            <CursorLayer boardRef={boardRef} />
            <PingLayer boardRef={boardRef} />
            <KeyboardCursor boardRef={boardRef} />
        </div>
    );
}
