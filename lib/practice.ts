/**
 * The target a practice race runs against. In PVP the opponent is only a
 * percentage on a bar, so the "racer" here is a time and the bar fills at the
 * rate that clears the board in that long. The time is the player's own best
 * on that board, recalibrating as they improve; with no record they race a
 * fixed par, labelled as par.
 */

import { bestFrom, boardKey, type BestTime } from "@/lib/bestTimes";

/**
 * What a player with no record races. Gentle: the first practice run exists to
 * be winnable. Their own time takes over once they clear it.
 */
export const PRACTICE_PAR_MS = 8 * 60 * 1000;

export interface PracticeTarget {
    ms: number;
    /** True when this is the player's own record rather than the fixed par. */
    isPersonal: boolean;
}

/**
 * The target for one board. Solo records only: `boardKey` defaults to one
 * player, and a group clear says nothing about a solo (shared/boardKeys.js).
 * `accountBests` is passed in rather than fetched: this runs inside a socket
 * handler with nothing to await, and should chase the record the banner shows.
 */
export function practiceTargetFor(
    rows: number,
    cols: number,
    mines: number,
    accountBests: Record<string, BestTime> | null = null,
): PracticeTarget {
    const best = bestFrom(accountBests, boardKey(rows, cols, mines));
    if (best === null) return { ms: PRACTICE_PAR_MS, isPersonal: false };
    return { ms: Math.max(1000, Math.round(best.seconds * 1000)), isPersonal: true };
}

/**
 * How full the target's bar is, 0-100. Derived from the run clock on every
 * tick, like `Timer`: a background tab throttles intervals and a counter drifts.
 */
export function targetPercent(
    startedAt: number | null,
    endedAt: number | null,
    targetMs: number,
    now = Date.now(),
): number {
    if (startedAt === null || targetMs <= 0) return 0;
    const elapsed = (endedAt ?? now) - startedAt;
    return Math.max(0, Math.min(100, Math.round((elapsed / targetMs) * 100)));
}
