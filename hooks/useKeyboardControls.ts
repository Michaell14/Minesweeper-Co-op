"use client";

import { useEffect } from "react";
import { useMinesweeperStore } from "@/app/store";

interface KeyboardActions {
    openCell: (row: number, col: number) => void;
    toggleFlag: (row: number, col: number) => void;
    chordCell: (row: number, col: number) => void;
    emitCellHover: (row: number, col: number) => void;
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
 * Controls that only own Enter/Space (activation). Arrows, F and Escape mean
 * nothing to them, so those keys stay with the board — and a movement key
 * BLURS them, because closing a dialog (or clicking Reset) parks focus on a
 * button, and with no focusable cell to Tab to, a wholesale guard would strand
 * a keyboard-only player there with every board key dead.
 */
const ACTIVATABLE = 'button, a[href], [tabindex]';

/**
 * A checkbox is an input, but keystroke-wise it is a button: Space toggles it
 * and nothing types into it, and unlike a radio it has no arrow-key group to
 * navigate. The HUD's flag-mode switch is one, and it is focusable mid-game —
 * treating it as EDITABLE stranded keyboard play on it just like the buttons.
 */
const isCheckbox = (el: Element | null | undefined): boolean =>
    el instanceof HTMLInputElement && el.type === "checkbox";

/**
 * Keyboard play: arrows/WASD move a selection cursor, Space/Enter reveals (or
 * chords an open number), F flags, Escape hides the cursor. Mounted next to
 * useChording by Grid and DailyChallenge, so passing each mode's own callbacks
 * covers every mode — sound, optimistic flags and the server-side gates all
 * live behind those callbacks already.
 *
 * State is read through getState() at event time, not subscribed: the listeners
 * stay stable and a keystroke costs no component a render (the useGameActions
 * pattern). The cursor itself lives in inputSlice; KeyboardCursor renders it.
 */
export function useKeyboardControls({ openCell, toggleFlag, chordCell, emitCellHover }: KeyboardActions): void {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const state = useMinesweeperStore.getState();
            if (!state.settings.keyboardControls) return;
            if (event.defaultPrevented) return;
            // Shift is deliberately ignored — it changes no binding here.
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (document.querySelector("dialog[open]")) return;
            const editableFocus = document.activeElement?.closest(EDITABLE);
            if (editableFocus && !isCheckbox(editableFocus)) return;
            const activatableFocus = editableFocus ?? document.activeElement?.closest(ACTIVATABLE);

            const key = event.key.toLowerCase();
            const { board, kbCursor } = state;

            const move = MOVES[key];
            if (move) {
                const rows = board.length;
                const cols = board[0]?.length || 0;
                if (rows === 0 || cols === 0) return;
                // Take the keyboard back from a focused button, so the NEXT
                // Space/Enter reveals instead of re-clicking it.
                if (activatableFocus instanceof HTMLElement) activatableFocus.blur();
                event.preventDefault();
                let next: { r: number; c: number };
                if (kbCursor === null) {
                    // First press shows the cursor at the centre without moving.
                    next = { r: Math.floor(rows / 2), c: Math.floor(cols / 2) };
                } else {
                    // The clamp also walks a cursor left out of bounds by a
                    // board change back onto the board.
                    next = {
                        r: Math.max(0, Math.min(rows - 1, kbCursor.r + move[0])),
                        c: Math.max(0, Math.min(cols - 1, kbCursor.c + move[1])),
                    };
                }
                state.setKbCursor(next);
                emitCellHover(next.r, next.c);
                return;
            }

            if (key === "escape") {
                if (kbCursor === null) return;
                event.preventDefault();
                state.setKbCursor(null);
                emitCellHover(-1, -1);
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
                // preventDefault before the PVP gate: a dead key must still
                // not scroll the page mid-game.
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
                 * Reveal on an open number chords, mirroring middle-click and
                 * its setting — but only on a NUMBER. The mouse path chords any
                 * open cell and eats a refusal for blanks; keyboard need not
                 * copy that. Flagged cells are protected: no-op.
                 */
                if (cell.isOpen && cell.nearbyMines > 0 && state.settings.chording) {
                    chordCell(kbCursor.r, kbCursor.c);
                }
            }
        };

        // The mouse taking over on the board dismisses the keyboard cursor;
        // clicking HUD controls leaves it alone.
        const onMouseDown = (event: MouseEvent) => {
            const state = useMinesweeperStore.getState();
            if (state.kbCursor === null) return;
            const target = event.target as Element | null;
            if (target?.closest?.('[role="grid"]')) {
                state.setKbCursor(null);
                emitCellHover(-1, -1);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("mousedown", onMouseDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            window.removeEventListener("mousedown", onMouseDown);
        };
    }, [openCell, toggleFlag, chordCell, emitCellHover]);
}
