"use client";

import { useEffect } from "react";
import { useMinesweeperStore } from "@/app/store";

/**
 * Chording: both mouse buttons down together on an opened number opens its
 * unflagged neighbours.
 *
 * `Cell` records which buttons are down and which cell they went down on; this
 * spots the pair and fires the move. `bothPressed` is the latch that stops the
 * releases from ALSO firing the ordinary open and flag those buttons mean on
 * their own — so it has to stay set across both releases, and clear after them.
 *
 * Which is why the release side is here rather than in `Cell`: a mouse-up only
 * reaches a cell when it happens over one. Let go anywhere else — off the board,
 * outside the window, or by alt-tabbing away — and the button state stayed
 * pressed forever, leaving `bothPressed` latched so the next plain left-click on
 * a number chorded instead of opening it.
 */
export function useChording(chordCell: (row: number, col: number) => void): void {
    const r = useMinesweeperStore((state) => state.r);
    const c = useMinesweeperStore((state) => state.c);
    const leftClick = useMinesweeperStore((state) => state.leftClick);
    const rightClick = useMinesweeperStore((state) => state.rightClick);
    const setBothPressed = useMinesweeperStore((state) => state.setBothPressed);
    const setLeftClick = useMinesweeperStore((state) => state.setLeftClick);
    const setRightClick = useMinesweeperStore((state) => state.setRightClick);

    useEffect(() => {
        if (leftClick && rightClick) {
            setBothPressed(true);
            if (r >= 0 && c >= 0) {
                chordCell(r, c);
            }
            return;
        }

        if (!leftClick && !rightClick) {
            setBothPressed(false);
        }
    }, [leftClick, rightClick, r, c, chordCell, setBothPressed]);

    useEffect(() => {
        const clear = () => {
            setLeftClick(false);
            setRightClick(false);
        };

        /*
         * `buttons` is what makes a global listener safe here: it reports the
         * buttons still held AFTER this release. Clearing on every mouse-up
         * would drop `bothPressed` between a chord's two releases, and the
         * second would then fire the open or flag the chord exists to suppress.
         */
        const onMouseUp = (event: MouseEvent) => {
            if (event.buttons === 0) clear();
        };

        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("blur", clear);
        return () => {
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("blur", clear);
        };
    }, [setLeftClick, setRightClick]);
}
