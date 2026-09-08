import type { StateCreator } from 'zustand';
import { boardPartOf, withPlayers } from '@/shared/boardKeys';
import { improvementOver, type BestResult, type BestTime, type Clear } from '@/lib/bestTimes';

/**
 * The signed-in player's board records, as the game reads them. The server
 * owns them (written inside the transaction that records the game); this is
 * the client's copy, fetched by `components/BestsSync.tsx` and kept in step
 * by the win handler. `null` means READ THE BROWSER INSTEAD, covering signed
 * out, not yet fetched, and API unavailable alike; `bestFrom` in lib/bestTimes
 * takes the same null.
 */

/**
 * The fastest record per board across the tables, earliest source winning a
 * tie. A straight replace would lose a clear finished while the fetch was in
 * flight. The trade: a record whose server write dropped survives here until
 * beaten, which is the lesser loss.
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
     * Clears finished before the account's table arrived. They cannot go in
     * `accountBests`: a table there switches off the localStorage fallback for
     * every OTHER board.
     */
    pendingClears: Record<string, BestTime>;
    /**
     * The fetched table, or null to fall back to the browser. A table is
     * merged keep-if-faster; null clears both, so one account's records do not
     * outlive its session.
     */
    setAccountBests: (bests: Record<string, BestTime> | null) => void;
    /**
     * Files a clear against the account's copy, keep-if-faster. Null when there
     * is no account copy yet; the run is retained either way.
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
     * Optimistic: the server's write is fire-and-forget and announces nothing,
     * so waiting would leave "New best!" and the number disagreeing. The key is
     * rebuilt from the run's own count, as `recordBestTime` and the import do.
     */
    recordAccountBest: (givenKey, run) => {
        const { accountBests, pendingClears } = get();
        const key = withPlayers(boardPartOf(givenKey), run.players);

        /*
         * Retained whether or not there is a table: on first sign-in an import
         * precedes the fetch, and a clear in that window would be replaced by
         * the older table.
         */
        set({ pendingClears: fastestOf(pendingClears, { [key]: run }) });

        if (!accountBests) return null;

        const result = improvementOver(accountBests[key] ?? null, run);
        if (result.improved) set({ accountBests: { ...accountBests, [key]: run } });
        return result;
    },
});
