"use client";

import { useEffect, useState } from "react";
import { useMinesweeperStore } from "@/app/store";
import { boardKey, boardLabel, readBestTime, type BestTime } from "@/lib/bestTimes";

/**
 * This browser's record for the board currently in play or selected.
 *
 * Read after mount, never during render. localStorage does not exist on the
 * server, so returning a value during the first render would produce markup
 * that disagrees with the client's and trip a hydration mismatch — the same
 * reason the theme is applied by a script rather than by React.
 *
 * It re-reads when the board changes, which is what stops a record following
 * the player onto a different difficulty and being read as that board's.
 *
 * `refreshKey` exists for the end-of-game case: the record is written by the
 * win handler, so a component already mounted needs a reason to look again.
 */
export function useBestTime(refreshKey: unknown = null): { best: BestTime | null; label: string } {
    const numRows = useMinesweeperStore((state) => state.numRows);
    const numCols = useMinesweeperStore((state) => state.numCols);
    const numMines = useMinesweeperStore((state) => state.numMines);

    const [best, setBest] = useState<BestTime | null>(null);

    useEffect(() => {
        setBest(readBestTime(boardKey(numRows, numCols, numMines)));
    }, [numRows, numCols, numMines, refreshKey]);

    return { best, label: boardLabel(numRows, numCols, numMines) };
}
