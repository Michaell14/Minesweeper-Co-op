'use client'
import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { MAX_BEST_IMPORT, fetchBoardBests, importBests } from '@/lib/statsApi';
import { bestsForImport, hasImportedBests, markBestsImported } from '@/lib/bestTimes';

/**
 * Renders nothing; keeps the store's copy of the ACCOUNT's board records in
 * step with who is signed in. Mounted once in the layout, beside SettingsSync.
 *
 * Signed in, the server's records are the ones the game shows — they are what
 * follows a player to a new device, which is the whole point of the account
 * holding them. Signed out (or if the fetch fails), the store holds null and
 * every reader falls back to this browser's localStorage records.
 *
 * One fetch per sign-in, not per board: the table is small, the game reads it
 * on the landing page and again on every board, and re-fetching per lookup
 * would put a network round trip in front of a number that has not changed.
 * The win handler keeps it current in the meantime.
 */

/**
 * Folds this browser's records into the account, once.
 *
 * Without it, everyone playing today loses their times from the banner the day
 * the account read ships: every record in existence is in localStorage, and the
 * account only knows the boards cleared since results started being recorded.
 * The button on /profile is not an answer — the blank banner is in the game,
 * and nothing there points at that page.
 *
 * Safe to do silently because the endpoint was built for it: keep-if-faster,
 * so it can only improve a private profile, and re-running it changes nothing.
 * A failure is left unmarked and retried on the next sign-in.
 */
const foldInLocalRecords = async () => {
    if (hasImportedBests()) return;

    const bests = bestsForImport(MAX_BEST_IMPORT);
    // Nothing to fold in yet — and deliberately NOT marked: this browser may
    // still be played on signed out, and those records deserve the same offer.
    if (bests.length === 0) return;

    if (await importBests(bests)) markBestsImported();
};

export default function BestsSync() {
    const { status } = useSession();
    const setAccountBests = useMinesweeperStore((s) => s.setAccountBests);

    React.useEffect(() => {
        if (status !== 'authenticated') {
            // Covers sign-out as much as never having signed in: leaving the
            // previous account's records in the store would show them to
            // whoever is at the keyboard now.
            setAccountBests(null);
            return;
        }

        let cancelled = false;
        // Sequential, not parallel: the fetch has to see what the import wrote,
        // or the records it just folded in are missing until the next sign-in.
        void foldInLocalRecords()
            .then(fetchBoardBests)
            .then((bests) => {
                if (!cancelled) setAccountBests(bests);
            });
        return () => {
            cancelled = true;
        };
    }, [status, setAccountBests]);

    return null;
}
