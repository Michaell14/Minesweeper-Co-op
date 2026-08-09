"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';

/** After this long the wait gets an explanation — a cold dyno, most likely. */
const SLOW_HINT_MS = 8_000;

/**
 * "Joining room…", shown on Landing while a create/join emit awaits its reply.
 *
 * The name dialog closes on Confirm and nothing changes until the server
 * answers — on a cold Heroku dyno that gap runs to many seconds, and a player
 * who sees Landing again assumes the click was swallowed and re-submits. Quick
 * match and the daily both show their wait; this is the same treatment for
 * rooms. The flag is set at emit (useGameActions) and cleared by whichever
 * reply lands (hooks/useGameEvents.ts).
 */
export default function JoinPendingIndicator() {
    const pending = useMinesweeperStore((state) => state.joinPending);
    const [slow, setSlow] = React.useState(false);

    React.useEffect(() => {
        if (!pending) {
            setSlow(false);
            return;
        }
        const timer = setTimeout(() => setSlow(true), SLOW_HINT_MS);
        return () => clearTimeout(timer);
    }, [pending]);

    if (!pending) return null;

    return (
        <div role="status" aria-live="polite" className="mt-6 text-center text-pixel-sm text-ink-muted">
            <p>{pending === 'create' ? 'Creating room…' : 'Joining room…'}</p>
            {slow && <p className="mt-2 text-pixel-2xs">Still trying — the server may be waking up.</p>}
        </div>
    );
}
