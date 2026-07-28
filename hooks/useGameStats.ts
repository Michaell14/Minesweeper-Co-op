"use client";

import { useMemo } from "react";
import { useMinesweeperStore } from "@/app/store";

/**
 * Board-derived numbers shared by the desktop and mobile layouts.
 *
 * These used to be computed twice over in Grid.tsx, once per layout tree.
 */
export function useGameStats() {
    const board = useMinesweeperStore((state) => state.board);
    const numMines = useMinesweeperStore((state) => state.numMines);
    const pvpOpponentProgress = useMinesweeperStore((state) => state.pvpOpponentProgress);
    const pvpTotalSafeCells = useMinesweeperStore((state) => state.pvpTotalSafeCells);

    /** Mines minus flags placed. Can go negative if you over-flag, as before. */
    const remainingFlags = useMemo(() => {
        let flagCount = 0;
        for (const row of board) {
            for (const cell of row) if (cell.isFlagged) flagCount++;
        }
        return numMines - flagCount;
    }, [board, numMines]);

    /** Safe cells this player has revealed. */
    const ownProgress = useMemo(() => {
        let revealed = 0;
        for (const row of board) {
            for (const cell of row) if (cell.isOpen && !cell.isMine) revealed++;
        }
        return revealed;
    }, [board]);

    const toPercent = (value: number) =>
        pvpTotalSafeCells <= 0 ? 0 : Math.round((value / pvpTotalSafeCells) * 100);

    return {
        remainingFlags,
        ownProgressPercent: toPercent(ownProgress),
        opponentProgressPercent: toPercent(pvpOpponentProgress),
    };
}
