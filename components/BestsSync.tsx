'use client'
import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { fetchBoardBests } from '@/lib/statsApi';

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
        fetchBoardBests().then((bests) => {
            if (!cancelled) setAccountBests(bests);
        });
        return () => {
            cancelled = true;
        };
    }, [status, setAccountBests]);

    return null;
}
