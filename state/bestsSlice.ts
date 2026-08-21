import type { StateCreator } from 'zustand';
import { boardPartOf, withPlayers } from '@/shared/boardKeys';
import { improvementOver, type BestResult, type BestTime, type Clear } from '@/lib/bestTimes';

/**
 * The signed-in player's board records, as the game reads them.
 *
 * The server owns these: it writes `user_board_bests` inside the transaction
 * that records the finished game, from its own clock. This is the client's copy
 * of that table, fetched once on sign-in by `components/BestsSync.tsx` and kept
 * in step by the win handler.
 *
 * `null` means READ THE BROWSER INSTEAD — and it deliberately covers three
 * cases at once: signed out, signed in but the records have not arrived yet,
 * and the account API being unavailable. All three want the same behaviour, so
 * a status enum would only give three names to one branch. `bestFrom` in
 * lib/bestTimes takes the same null and falls back to localStorage.
 */

/**
 * The server's table, with anything faster already in the store kept.
 *
 * A straight replace would be the obvious reading of "the server is
 * authoritative", and it loses a clear finished while the fetch was in flight:
 * the win handler had no table to file against, so the table that lands
 * predates the run and the banner goes stale until the next page load.
 *
 * The trade is real and worth naming: a record whose server write DROPPED
 * (stats are best-effort on a game path) now survives here until something
 * beats it, instead of vanishing at the next fetch. Losing a real record is the
 * worse of the two — both numbers come off the same clock.
 */
const withFasterKept = (
    server: Record<string, BestTime>,
    held: Record<string, BestTime> | null,
): Record<string, BestTime> => {
    if (!held) return server;

    const merged = { ...server };
    for (const [key, entry] of Object.entries(held)) {
        const known = merged[key];
        if (!known || entry.seconds < known.seconds) merged[key] = entry;
    }
    return merged;
};

export interface BestsSlice {
    accountBests: Record<string, BestTime> | null;
    /**
     * The fetched table, or null to fall back to this browser's records. A
     * table is merged keep-if-faster over what is held; null clears it, which
     * is what stops one account's records outliving its session.
     */
    setAccountBests: (bests: Record<string, BestTime> | null) => void;
    /**
     * Files a clear against the account's copy, keep-if-faster, and says what
     * it did. Null when there is no account copy in play — the caller then
     * shows what the browser's own record made of the run.
     */
    recordAccountBest: (key: string, run: Clear) => BestResult | null;
}

export const createBestsSlice: StateCreator<BestsSlice> = (set, get) => ({
    accountBests: null,

    setAccountBests: (bests) =>
        set((state) => ({
            accountBests: bests === null ? null : withFasterKept(bests, state.accountBests),
        })),

    /*
     * Optimistic, on purpose. The server records the same clear from its own
     * clock, but that write is fire-and-forget on a game path and announces
     * nothing when it lands — so waiting for it would leave "New best!" and the
     * number under it disagreeing for as long as the round trip takes, on the
     * one screen where the player is looking straight at them. The next fetch
     * reconciles it with what the server actually stored.
     *
     * The key is rebuilt from the run's own count, the same normalisation
     * `recordBestTime` and the import path apply: one spelling, or the record
     * goes where nothing looks for it.
     */
    recordAccountBest: (givenKey, run) => {
        const bests = get().accountBests;
        if (!bests) return null;

        const key = withPlayers(boardPartOf(givenKey), run.players);
        const result = improvementOver(bests[key] ?? null, run);
        if (result.improved) set({ accountBests: { ...bests, [key]: run } });
        return result;
    },
});
