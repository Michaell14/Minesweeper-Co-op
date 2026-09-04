'use client'
import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { MAX_BEST_IMPORT, fetchBoardBests, importBests } from '@/lib/statsApi';
import { bestsForImport, hasImportedBests, markBestsImported } from '@/lib/bestTimes';

/**
 * Renders nothing; keeps the store's copy of the ACCOUNT's board records in
 * step with who is signed in. Mounted once in the layout, beside SettingsSync.
 * Signed in, the server's records are what the game shows; signed out (or on
 * a failed fetch) the store holds null and readers fall back to localStorage.
 * One fetch per sign-in, not per board; the win handler keeps it current.
 */

/**
 * Folds this browser's records into the account, once. Without it every
 * existing record (all in localStorage) vanishes from the banner the day the
 * account read ships. Safe to do silently: the endpoint is keep-if-faster and
 * idempotent. A failure is left unmarked and retried on the next sign-in.
 */
const foldInLocalRecords = async () => {
    if (hasImportedBests()) return;

    const bests = bestsForImport(MAX_BEST_IMPORT);
    // Nothing to fold in yet, and NOT marked: records made signed out later deserve the same offer.
    if (bests.length === 0) return;

    if (await importBests(bests)) markBestsImported();
};

export default function BestsSync() {
    const { status } = useSession();
    const setAccountBests = useMinesweeperStore((s) => s.setAccountBests);

    React.useEffect(() => {
        if (status !== 'authenticated') {
            // Covers sign-out too: the previous account's records must not linger.
            setAccountBests(null);
            return;
        }

        let cancelled = false;
        // Sequential: the fetch has to see what the import wrote.
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
