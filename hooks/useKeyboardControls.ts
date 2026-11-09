"use client";

import { useEffect } from "react";
import { useMinesweeperStore } from "@/app/store";

export interface KeyboardActions {
    openCell: (row: number, col: number) => void;
    toggleFlag: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
    emitCellHover: (row: number, col: number) => void;
    /** Omitted where there is nobody to point at — the daily is single-player. */
    pingCell?: (row: number, col: number) => void;
}

const MOVES: Record<string, [number, number]> = {
    arrowup: [-1, 0],
    arrowdown: [1, 0],
    arrowleft: [0, -1],
    arrowright: [0, 1],
    w: [-1, 0],
    s: [1, 0],
    a: [0, -1],
    d: [0, 1],
};

/** Controls that consume keystrokes wholesale: typing, or arrow-driven. */
const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/**
 * Controls that only own Enter/Space. Arrows, F and Escape stay with the
 * board, and a movement key BLURS them: closing a dialog parks focus on a
 * button, and a wholesale guard would strand a keyboard player there.
 */
const ACTIVATABLE = 'button, a[href], [tabindex]';

/**
 * A checkbox is an input but keystroke-wise a button: Space toggles it, nothing
 * types into it. The HUD's flag-mode switch is one, focusable mid-game.
 */
const isCheckbox = (el: Element | null | undefined): boolean =>
    el instanceof HTMLInputElement && el.type === "checkbox";

/**
 * The board cell at a viewport point, by the `data-row`/`data-col` the ping
 * interception also reads. Hit-tested at the keypress rather than remembered
 * from mouseenter, so a scroll under a still mouse cannot leave it naming the
 * wrong cell. The board's overlays are `pointer-events: none`, so the hit
 * lands on the cell.
 */
const cellAtPoint = (x: number, y: number): { r: number; c: number } | null => {
    // Optional call: jsdom has no hit testing.
    const hit = document.elementFromPoint?.(x, y);
    const cell = hit?.closest('[role="grid"] [role="gridcell"]');
    if (!(cell instanceof HTMLElement)) return null;
    const r = Number(cell.dataset.row);
    const c = Number(cell.dataset.col);
    return Number.isInteger(r) && Number.isInteger(c) ? { r, c } : null;
};

/**
 * Keyboard play: arrows/WASD move a cursor, Space/Enter reveals (or chords an
 * open number), F flags, Escape hides the cursor. With the mouse, Space flags
 * the covered cell under it or chords the number under it. Mounted beside
 * useChording by Grid and DailyChallenge with each mode's own callbacks. State
 * is read via getState() at event time so a keystroke costs no render; the
 * cursor lives in inputSlice and KeyboardCursor renders it.
 */
export function useKeyboardControls({ openCell, toggleFlag, chordCell, emitCellHover, pingCell }: KeyboardActions): void {
    useEffect(() => {
        /*
         * Space has two owners: the keyboard cursor (reveal) and the mouse
         * (flag or chord what it points at). Whichever moved last holds it, so
         * a keyboard player whose mouse rests on the board keeps Space, and a
         * mouse player never reveals a cell they are not pointing at. Only a
         * move that changes the position counts, so a still mouse never takes
         * Space from the keyboard.
         */
        const mouse = { x: NaN, y: NaN, ownsSpace: false };

        const onKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            // Navigating by keyboard, anywhere on the page, hands Space back.
            if (key === "tab" || MOVES[key]) mouse.ownsSpace = false;

            const state = useMinesweeperStore.getState();
            if (event.defaultPrevented) return;
            // Shift changes no binding here.
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (document.querySelector("dialog[open]")) return;
            const editableFocus = document.activeElement?.closest(EDITABLE);
            if (editableFocus && !isCheckbox(editableFocus)) return;
            // The grid is a keyboard entry point, not a button: it keeps focus
            // while arrows move and Space/Enter act on its selected cell.
            const gridFocused = document.activeElement?.matches('[role="grid"]');
            const activatableFocus = gridFocused ? null : editableFocus ?? document.activeElement?.closest(ACTIVATABLE);

            const { board, kbCursor } = state;

            if (key === "escape") {
                if (kbCursor === null && !state.pingArmed) return;
                event.preventDefault();
                state.setPingArmed(false);
                if (kbCursor !== null) {
                    state.setKbCursor(null);
                    emitCellHover(-1, -1);
                }
                return;
            }

            /*
             * Space under the mouse. Its own setting, so it works with
             * keyboard controls off. While the mouse holds Space it is the
             * board's alone: a press that misses every cell (the gap between
             * cells, the border, past the edge) does nothing, like a click
             * there, instead of scrolling the board away, pressing a button
             * clicked earlier or revealing under a keyboard cursor left behind.
             */
            if (key === " " && mouse.ownsSpace && state.settings.spaceToFlag && board.length > 0) {
                event.preventDefault();
                // A button the mouse clicked earlier keeps focus; Space must not press it again.
                if (activatableFocus instanceof HTMLElement) activatableFocus.blur();
                if (event.repeat) return;
                const target = cellAtPoint(mouse.x, mouse.y);
                const cell = target && board[target.r]?.[target.c];
                if (!target || !cell) return;
                // The mouse is playing now, like a click on the board; the shared hover follows it.
                if (kbCursor !== null) {
                    state.setKbCursor(null);
                    emitCellHover(target.r, target.c);
                }
                if (state.mode === "pvp" && !state.pvpStarted) return;
                if (!cell.isOpen) {
                    toggleFlag(target.r, target.c);
                } else if (cell.nearbyMines > 0 && state.settings.chording) {
                    chordCell(target.r, target.c);
                }
                return;
            }

            if (!state.settings.keyboardControls) return;

            const move = MOVES[key];
            if (move) {
                const rows = board.length;
                const cols = board[0]?.length || 0;
                if (rows === 0 || cols === 0) return;
                // Take the keyboard back from a focused button for the NEXT Space/Enter.
                if (activatableFocus instanceof HTMLElement) activatableFocus.blur();
                event.preventDefault();
                let next: { r: number; c: number };
                if (kbCursor === null) {
                    // First press shows the cursor at the centre without moving.
                    next = { r: Math.floor(rows / 2), c: Math.floor(cols / 2) };
                } else {
                    // The clamp also walks a cursor left out of bounds by a board change back on.
                    next = {
                        r: Math.max(0, Math.min(rows - 1, kbCursor.r + move[0])),
                        c: Math.max(0, Math.min(cols - 1, kbCursor.c + move[1])),
                    };
                }
                state.setKbCursor(next);
                emitCellHover(next.r, next.c);
                return;
            }

            /*
             * P points at the cell under the cursor. A plain key: the guard
             * above drops Ctrl/Meta/Alt, and Shift is the MOUSE shortcut. No
             * arming step, since the cursor already says which cell.
             */
            if (key === "p") {
                if (!pingCell || kbCursor === null) return;
                if (event.repeat) return;
                if (activatableFocus) return;
                event.preventDefault();
                if (state.mode === "pvp") return;
                pingCell(kbCursor.r, kbCursor.c);
                return;
            }

            if (key === " " || key === "enter" || key === "f") {
                // A focused button or link keeps its Enter/Space activation.
                if (activatableFocus && key !== "f") return;
                // Auto-repeat would spam flags, blips and sockets.
                if (event.repeat) return;
                if (kbCursor === null) return;
                const cell = board[kbCursor.r]?.[kbCursor.c];
                if (!cell) return;
                // preventDefault before the PVP gate: a dead key must not scroll mid-game.
                event.preventDefault();
                if (state.mode === "pvp" && !state.pvpStarted) return;

                if (key === "f") {
                    toggleFlag(kbCursor.r, kbCursor.c);
                    return;
                }
                if (!cell.isOpen && !cell.isFlagged) {
                    openCell(kbCursor.r, kbCursor.c);
                    return;
                }
                /*
                 * Reveal on an open NUMBER chords, mirroring middle-click and
                 * its setting. Blanks and flagged cells are no-ops.
                 */
                if (cell.isOpen && cell.nearbyMines > 0 && state.settings.chording) {
                    chordCell(kbCursor.r, kbCursor.c);
                }
            }
        };

        // The mouse on the board dismisses the cursor; HUD clicks leave it alone.
        const onMouseDown = (event: MouseEvent) => {
            const state = useMinesweeperStore.getState();
            if (state.kbCursor === null) return;
            const target = event.target as Element | null;
            if (target?.closest?.('[role="grid"]')) {
                state.setKbCursor(null);
                emitCellHover(-1, -1);
            }
        };

        const onPointerMove = (event: PointerEvent) => {
            // A finger has already lifted by the time a key could follow it.
            if (event.pointerType !== "mouse") return;
            if (event.clientX === mouse.x && event.clientY === mouse.y) return;
            mouse.x = event.clientX;
            mouse.y = event.clientY;
            mouse.ownsSpace = true;
        };

        // Out of the window, the last position names a cell nobody is pointing at.
        const onPointerOut = (event: PointerEvent) => {
            if (event.relatedTarget === null) mouse.ownsSpace = false;
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("mousedown", onMouseDown);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerout", onPointerOut);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerout", onPointerOut);
        };
    }, [openCell, toggleFlag, chordCell, emitCellHover, pingCell]);
}
