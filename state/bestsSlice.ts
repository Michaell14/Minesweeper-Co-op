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
export interface BestsSlice {
    accountBests: Record<string, BestTime> | null;
    /** The fetched table, or null to fall back to this browser's records. */
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

    setAccountBests: (accountBests) => set({ accountBests }),

    /*
     * Optimistic, on purpose. The server records the same clear from its own
     * clock, but that write is fire-and-forget on a game path and announces
     * nothing when it lands — so waiting for it would leave "New best!" and the
     * number under it disagreeing for as long as the round trip takes, on the
     * one screen where the player is looking straight at them. The next sign-in
     * fetch replaces this with what the server actually stored.
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
