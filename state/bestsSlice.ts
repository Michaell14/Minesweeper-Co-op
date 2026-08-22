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
 * The fastest record for each board across every table given, earliest source
 * winning a tie — the same rule the browser's copy and the server's upsert
 * both apply.
 *
 * A straight replace would be the obvious reading of "the server is
 * authoritative", and it loses a clear finished while the fetch was in flight:
 * the table that lands predates the run, and the banner goes stale until the
 * next page load.
 *
 * The trade is real and worth naming: a record whose server write DROPPED
 * (stats are best-effort on a game path) now survives here until something
 * beats it, instead of vanishing at the next fetch. Losing a real record is the
 * worse of the two — both numbers come off the same clock.
 */
const fastestOf = (
    ...tables: (Record<string, BestTime> | null)[]
): Record<string, BestTime> => {
    const merged: Record<string, BestTime> = {};

    for (const table of tables) {
        if (!table) continue;
        for (const [key, entry] of Object.entries(table)) {
            const known = merged[key];
            if (!known || entry.seconds < known.seconds) merged[key] = entry;
        }
    }
    return merged;
};

export interface BestsSlice {
    accountBests: Record<string, BestTime> | null;
    /**
     * Clears finished before the account's table arrived, held until it does.
     *
     * They cannot go in `accountBests`: a table there means "these are the
     * account's records", which switches off the localStorage fallback for
     * every OTHER board — so seeding one to have somewhere to write would
     * blank the banner on boards this browser does have records for, on every
     * page load, to fix a race that happens on almost none of them.
     */
    pendingClears: Record<string, BestTime>;
    /**
     * The fetched table, or null to fall back to this browser's records. A
     * table is merged keep-if-faster over what is held and what was cleared
     * while it was in flight; null clears both, which is what stops one
     * account's records outliving its session.
     */
    setAccountBests: (bests: Record<string, BestTime> | null) => void;
    /**
     * Files a clear against the account's copy, keep-if-faster, and says what
     * it did. Null when there is no account copy to compare against — the
     * caller then shows what the browser's own record made of the run, which
     * is the best answer available until the table lands. The run is retained
     * either way, so the table that lands cannot undo it.
     */
    recordAccountBest: (key: string, run: Clear) => BestResult | null;
}

export const createBestsSlice: StateCreator<BestsSlice> = (set, get) => ({
    accountBests: null,
    pendingClears: {},

    setAccountBests: (bests) =>
        set((state) =>
            bests === null
                ? { accountBests: null, pendingClears: {} }
                : {
                    accountBests: fastestOf(bests, state.accountBests, state.pendingClears),
                    // Folded in, so they stop being pending.
                    pendingClears: {},
                },
        ),

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
        const { accountBests, pendingClears } = get();
        const key = withPlayers(boardPartOf(givenKey), run.players);

        /*
         * Retained whether or not there is a table to file into. Sign-in
         * resolving is what starts the fetch, and on a first sign-in an import
         * goes ahead of it — two round trips during which a player can finish a
         * board. Without this the table that lands predates the clear and
         * quietly replaces it with an older record.
         */
        set({ pendingClears: fastestOf(pendingClears, { [key]: run }) });

        if (!accountBests) return null;

        const result = improvementOver(accountBests[key] ?? null, run);
        if (result.improved) set({ accountBests: { ...accountBests, [key]: run } });
        return result;
    },
});
