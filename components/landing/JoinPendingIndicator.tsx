"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';

/** After this long the wait gets an explanation — a cold dyno, most likely. */
const SLOW_HINT_MS = 8_000;

/**
 * "Joining room…", shown on Landing while a create/join emit awaits its reply,
 * so a cold-dyno wait does not read as a swallowed click. Set at emit
 * (useGameActions), cleared by whichever reply lands (hooks/useGameEvents.ts).
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
