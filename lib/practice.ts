/**
 * The target a practice race runs against.
 *
 * A practice race has no opponent, because in PVP there is nothing to be one
 * WITH: the whole opponent is a percentage on a bar. So the "racer" here is a
 * time, and the bar fills at whatever rate clears the board in exactly that
 * long.
 *
 * The time is the player's own best on that board, which is the point — it is
 * real, it needs no invented difficulty tiers, and it recalibrates itself every
 * time they improve. A player with no record yet races a fixed par, labelled as
 * par rather than dressed up as theirs.
 */

import { bestFrom, boardKey, type BestTime } from "@/lib/bestTimes";

/**
 * What a player with no record on this board races.
 *
 * Deliberately gentle: the first practice run exists to be winnable, and a par
 * that beats a newcomer teaches them the button is not for them. Once they
 * clear it once, their own time takes over and the number stops being ours.
 */
export const PRACTICE_PAR_MS = 8 * 60 * 1000;

export interface PracticeTarget {
    ms: number;
    /** True when this is the player's own record rather than the fixed par. */
    isPersonal: boolean;
}

/**
 * The target for one board. Solo records only — `boardKey` defaults to a player
 * count of 1, and a board someone cleared with three friends says nothing about
 * what they can do alone (see shared/boardKeys.js).
 *
 * `accountBests` is the signed-in player's records, or null to read this
 * browser's. Passed in rather than fetched: this runs inside a socket handler
 * on the way into a room, where there is nothing to await — and a practice race
 * should chase the same record the banner shows, wherever that lives.
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
 * How full the target's bar is, 0-100.
 *
 * Derived from the run clock on every tick rather than counted up, the same way
 * `Timer` does it: a background tab throttles intervals, and a counter would
 * drift away from the time the board is actually being judged against.
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
