"use client";

import { useEffect, useState } from "react";
import { useMinesweeperStore } from "@/app/store";
import { bestFrom, boardKey, boardLabel, playersForClear, type BestTime } from "@/lib/bestTimes";

/**
 * Your record for the board currently in play or selected.
 *
 * Signed in, that is the ACCOUNT's record — the server writes it from its own
 * clock and it follows you to whatever device you sign in on next. Signed out
 * (or before the account's records arrive, or if they cannot be fetched) it is
 * this browser's localStorage copy. `state/bestsSlice.ts` holds the account's
 * side; a null there means "read the browser", which is the whole branch.
 *
 * Read after mount, never during render. localStorage does not exist on the
 * server, so returning a value during the first render would produce markup
 * that disagrees with the client's and trip a hydration mismatch — the same
 * reason the theme is applied by a script rather than by React.
 *
 * It re-reads when the board changes, which is what stops a record following
 * the player onto a different difficulty and being read as that board's. The
 * SIZE OF THE GROUP is part of that board's identity, so it re-reads on that
 * too: on the landing page nobody has joined yet, which reads as solo — the
 * record you would be chasing if you played it alone.
 *
 * `refreshKey` exists for the end-of-game case: the record is written by the
 * win handler, so a component already mounted needs a reason to look again.
 */
export function useBestTime(refreshKey: unknown = null): { best: BestTime | null; label: string } {
    const numRows = useMinesweeperStore((state) => state.numRows);
    const numCols = useMinesweeperStore((state) => state.numCols);
    const numMines = useMinesweeperStore((state) => state.numMines);
    const mode = useMinesweeperStore((state) => state.mode);
    const playersInRoom = useMinesweeperStore((state) => state.playerStatsInRoom.length);
    const accountBests = useMinesweeperStore((state) => state.accountBests);

    // The same derivation the win handler files under. Two spellings of it is
    // how a record gets written where nothing will ever look for it.
    const players = playersForClear(mode, playersInRoom);

    const [best, setBest] = useState<BestTime | null>(null);

    useEffect(() => {
        setBest(bestFrom(accountBests, boardKey(numRows, numCols, numMines, players)));
    }, [numRows, numCols, numMines, players, accountBests, refreshKey]);

    return { best, label: boardLabel(numRows, numCols, numMines) };
}
