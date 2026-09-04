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
     * Safe cells revealed and total to reveal, raw (the summary needs counts).
     * Derived from the board, not pvpTotalSafeCells, which is PVP-only.
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

    /**
     * Percent of the safe cells there are to open. `pvpTotalSafeCells` is
     * PVP-only, so this falls back to the board-derived count everywhere else
     * rather than dividing by zero.
     */
    const toPercent = (value: number) => {
        const total = pvpTotalSafeCells > 0 ? pvpTotalSafeCells : safeCells;
        return total <= 0 ? 0 : Math.round((value / total) * 100);
    };

    return {
        remainingFlags,
        ownProgress,
        safeCells,
        ownProgressPercent: toPercent(ownProgress),
        opponentProgressPercent: toPercent(pvpOpponentProgress),
    };
}
