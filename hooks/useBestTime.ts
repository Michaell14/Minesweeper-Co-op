"use client";

import { useEffect, useState } from "react";
import { useMinesweeperStore } from "@/app/store";
import { bestFrom, boardKey, boardLabel, playersForClear, type BestTime } from "@/lib/bestTimes";

/**
 * Your record for the board in play or selected. Signed in, the ACCOUNT's
 * record (`state/bestsSlice.ts`; null there means "read the browser"); signed
 * out, or before they arrive or if they cannot be fetched, this browser's
 * localStorage copy.
 *
 * Read after mount, never during render: localStorage does not exist on the
 * server, and a first-render value would trip a hydration mismatch. Re-reads
 * when the board or the group size changes, since both are part of the
 * record's identity; on the landing page nobody has joined, which reads as
 * solo. `refreshKey` lets a mounted component look again after the win
 * handler writes.
 */
export function useBestTime(refreshKey: unknown = null): { best: BestTime | null; label: string } {
    const numRows = useMinesweeperStore((state) => state.numRows);
    const numCols = useMinesweeperStore((state) => state.numCols);
    const numMines = useMinesweeperStore((state) => state.numMines);
    const mode = useMinesweeperStore((state) => state.mode);
    const playersInRoom = useMinesweeperStore((state) => state.playerStatsInRoom.length);
    const accountBests = useMinesweeperStore((state) => state.accountBests);

    // The same derivation the win handler files under; two spellings of it lose the record.
    const players = playersForClear(mode, playersInRoom);

    const [best, setBest] = useState<BestTime | null>(null);

    useEffect(() => {
        setBest(bestFrom(accountBests, boardKey(numRows, numCols, numMines, players)));
    }, [numRows, numCols, numMines, players, accountBests, refreshKey]);

    return { best, label: boardLabel(numRows, numCols, numMines) };
}
