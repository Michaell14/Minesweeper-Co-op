import React, { useEffect, useState } from 'react';
import { useMinesweeperStore } from '@/app/store';
import { elapsedSeconds, formatClock } from '@/lib/gameClock';

/**
 * Seconds elapsed in the current run. Re-derived from the timestamps on every
 * tick rather than counted: a background tab throttles timers, and a counter
 * would drift with no way to recover. Nothing is scheduled once the run ends.
 */
const useElapsedSeconds = (startedAt: number | null, endedAt: number | null) => {
    const [seconds, setSeconds] = useState(() => elapsedSeconds(startedAt, endedAt));

    useEffect(() => {
        const tick = () => setSeconds(elapsedSeconds(startedAt, endedAt));
        tick();

        if (startedAt === null || endedAt !== null) return;
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [startedAt, endedAt]);

    return seconds;
};

export interface TimerProps {
    /**
     * Where it is shown, matching FlagCounter: `bar` (desktop HUD, larger type)
     * or `hud` (mobile sticky bar and daily row, small type).
     */
    variant: 'bar' | 'hud';
}

/** How long the current run has been going. Frozen once it ends. */
export default function Timer({ variant }: TimerProps) {
    const startedAt = useMinesweeperStore((state) => state.startedAt);
    const endedAt = useMinesweeperStore((state) => state.endedAt);
    const showTimer = useMinesweeperStore((state) => state.settings.showTimer);
    const seconds = useElapsedSeconds(startedAt, endedAt);

    // The HUD setting only: the run still times, and the summary reports it.
    if (!showTimer) return null;

    const value = formatClock(seconds);
    /*
     * The digits are aria-hidden (announcing every second would talk over the
     * game), so the label carries the reading. `role="timer"` is load-bearing:
     * aria-label is ignored on a generic element, and `timer` defaults to
     * aria-live="off".
     */
    const label = startedAt === null ? 'Timer not started' : `Elapsed time ${value}`;

    /* Bare in both bars — see FlagCounter, which they sit beside. */
    return (
        <p
            className={`${variant === 'bar' ? 'text-pixel-md' : 'text-pixel-sm'} whitespace-nowrap`}
            role="timer"
            aria-label={label}>
            <span aria-hidden="true">⏱ {value}</span>
        </p>
    );
}
