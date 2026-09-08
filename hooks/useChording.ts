"use client";

import { useEffect } from "react";
import { useMinesweeperStore } from "@/app/store";

/**
 * Chording: both mouse buttons down on an opened number opens its unflagged
 * neighbours. `Cell` records which buttons are down; this spots the pair and
 * fires the move. `bothPressed` is the latch that stops the releases ALSO
 * firing the plain open and flag, so it stays set across both releases. The
 * release side is here, not in `Cell`, because a mouse-up off the board or
 * outside the window never reaches a cell and left the latch stuck. Watched
 * with `subscribe`, not hook selectors, so the host never re-renders.
 */
export function useChording(chordCell: (row: number, col: number) => void): void {
    useEffect(() => {
        const unsubscribe = useMinesweeperStore.subscribe((state, prev) => {
            const both = state.leftClick && state.rightClick;
            const prevBoth = prev.leftClick && prev.rightClick;

            if (both && !prevBoth) {
                /*
                 * Latched even with chording OFF, or releasing the pair would
                 * fire the open AND the flag. Disabled means it does nothing.
                 */
                state.setBothPressed(true);
                if (state.settings.chording && state.r >= 0 && state.c >= 0) {
                    chordCell(state.r, state.c);
                }
                return;
            }

            // Skips a store write on the release of every PLAIN click.
            if (state.bothPressed && !state.leftClick && !state.rightClick) {
                state.setBothPressed(false);
            }
        });

        const clear = () => {
            const { setLeftClick, setRightClick } = useMinesweeperStore.getState();
            setLeftClick(false);
            setRightClick(false);
        };

        /*
         * `buttons` reports what is still held AFTER this release. Clearing on
         * every mouse-up would drop `bothPressed` between a chord's two releases.
         */
        const onMouseUp = (event: MouseEvent) => {
            if (event.buttons === 0) clear();
        };

        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("blur", clear);
        return () => {
            unsubscribe();
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("blur", clear);
        };
    }, [chordCell]);
}
