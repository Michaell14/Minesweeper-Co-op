import React, { useLayoutEffect, useRef, useState } from 'react';
import { useMinesweeperStore } from '@/app/store';
import Cell from '@/components/game/Cell';
import CursorLayer from '@/components/game/CursorLayer';
import PingLayer from '@/components/game/PingLayer';
import KeyboardCursor from '@/components/game/KeyboardCursor';
import DeductionLayer from '@/components/game/DeductionLayer';
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
    const rows = board.length;

    /*
     * Page height ABOVE the board, for the height half of the fit clamp in
     * board.module.css (cqh does not resolve in Grid.tsx's inline-size
     * container). Measured, since the status banner varies it: 0px in play,
     * 88px at game over, 119px in a PVP lobby. The token applies until then.
     */
    const [reserve, setReserve] = useState<number | null>(null);
    /*
     * No dependency array: an observer bound once at mount kept watching a
     * wrapper React had swapped out. Re-setting an unchanged reserve is a
     * no-op, so this settles rather than loops.
     */
    useLayoutEffect(() => {
        const el = boardRef.current;
        if (!el) return;
        // + scrollY converts the rect to a document offset, invariant under
        // scroll; rect.top alone goes negative when scrolled and reserves nothing.
        const measure = () => setReserve(Math.ceil(el.getBoundingClientRect().top + window.scrollY));
        measure();
        const observer = new ResizeObserver(measure);
        if (el.parentElement) observer.observe(el.parentElement);
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    });

    /*
     * Ping interception in the CAPTURE phase on the grid, not in Cell: Cell
     * acts from four handlers across four branches, and a missed one is a ping
     * that opens a mine. `mousedown` is what has to be swallowed, since the
     * opened-cell branch acts on mouse up and a click handler would be too late.
     */
    const takeoverForPing = (event: React.MouseEvent): boolean => {
        if (event.button !== 0 || !pingCell) return false;
        const { pingArmed, mode } = useMinesweeperStore.getState();
        // Shift is the desktop shortcut; the tray's one-shot arm also works on touch.
        if (!pingArmed && !event.shiftKey) return false;
        // Nothing to point at in a race — and the server would refuse it.
        if (mode === 'pvp') return false;
        return (event.target as Element | null)?.closest('[role="gridcell"]') !== null;
    };

    /*
     * Whether the gesture IN PROGRESS belongs to the ping. A latch, because the
     * arm is one-shot and clears when the ping is sent; re-deciding on mouseup
     * would hand the cell back to its own handlers and open it under the ping.
     * Caught by the smoke suite, whose `pingCell` really disarms.
     */
    const pingGesture = useRef(false);

    const onPointerCapture = (event: React.MouseEvent) => {
        // Cleared first so a latch from a press that never finished cannot outlive this one.
        pingGesture.current = false;
        if (!takeoverForPing(event)) return;
        const cell = (event.target as Element).closest('[role="gridcell"]') as HTMLElement;
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        // Stop the cell's own handlers and the shift-click text selection.
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
            /* Only this component knows the shape. BOTH axes: the fit clamp takes
               the smaller answer, so a tall board on a short window shrinks. */
            style={{
                '--board-cols': cols,
                '--board-rows': rows,
                ...(reserve === null ? {} : { '--ms-board-reserve': `${reserve}px` }),
            } as React.CSSProperties}
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
            <DeductionLayer boardRef={boardRef} />
        </div>
    );
}
