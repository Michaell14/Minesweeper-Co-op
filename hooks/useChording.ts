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
 *
 * The store is watched with `subscribe`, not hook selectors: nothing here
 * renders, and a selector would re-render the host — Grid, the whole layout —
 * on every press and release of an open cell (the useKeyboardControls pattern).
 */
export function useChording(chordCell: (row: number, col: number) => void): void {
    useEffect(() => {
        const unsubscribe = useMinesweeperStore.subscribe((state, prev) => {
            const both = state.leftClick && state.rightClick;
            const prevBoth = prev.leftClick && prev.rightClick;

            if (both && !prevBoth) {
                /*
                 * The latch is set even with chording OFF: without it, releasing
                 * a both-buttons press would fire the open AND the flag the two
                 * buttons mean alone. Disabled chording means the pair does
                 * nothing — not two accidents.
                 */
                state.setBothPressed(true);
                if (state.settings.chording && state.r >= 0 && state.c >= 0) {
                    chordCell(state.r, state.c);
                }
                return;
            }

            // The bothPressed check skips a store write on the release of every
            // PLAIN click — only a pair that actually latched needs unlatching.
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
            unsubscribe();
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("blur", clear);
        };
    }, [chordCell]);
}
