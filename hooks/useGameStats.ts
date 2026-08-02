"use client";

import { useMemo } from "react";
import { useMinesweeperStore } from "@/app/store";

/** Board-derived numbers shared by the desktop and mobile layouts. */
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

    /**
     * Safe cells this player has revealed, and how many there are to reveal.
     * Returned raw as well as as percentages, because the end-of-game summary
     * needs the counts.
     *
     * `safeCells` is derived from the board rather than from pvpTotalSafeCells,
     * which the server only sets in PVP — co-op needs the same number.
     */
    const { ownProgress, safeCells } = useMemo(() => {
        let revealed = 0;
        let cells = 0;
        for (const row of board) {
            cells += row.length;
            for (const cell of row) if (cell.isOpen && !cell.isMine) revealed++;
        }
        return { ownProgress: revealed, safeCells: Math.max(0, cells - numMines) };
    }, [board, numMines]);

    const toPercent = (value: number) =>
        pvpTotalSafeCells <= 0 ? 0 : Math.round((value / pvpTotalSafeCells) * 100);

    return {
        remainingFlags,
        ownProgress,
        safeCells,
        ownProgressPercent: toPercent(ownProgress),
        opponentProgressPercent: toPercent(pvpOpponentProgress),
    };
}
