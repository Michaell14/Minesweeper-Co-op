import React, { useEffect, useState } from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Panel } from '@/components/ds';
import { elapsedSeconds, formatClock } from '@/lib/gameClock';

/**
 * Seconds elapsed in the current run.
 *
 * The interval only runs while the clock is running, so a finished or unstarted
 * board schedules nothing. It re-derives from the timestamps on every tick
 * rather than incrementing a counter: a background tab throttles timers, and a
 * counter would drift behind the real elapsed time with no way to recover.
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
     * Where it is being shown:
     *   panel -> boxed, matching FlagCounter  (desktop side panel)
     *   hud   -> bare, no box                 (mobile sticky bar)
     */
    variant: 'panel' | 'hud';
}

/** How long the current run has been going. Frozen once it ends. */
export default function Timer({ variant }: TimerProps) {
    const startedAt = useMinesweeperStore((state) => state.startedAt);
    const endedAt = useMinesweeperStore((state) => state.endedAt);
    const seconds = useElapsedSeconds(startedAt, endedAt);

    const value = formatClock(seconds);
    /*
     * The digits are hidden from assistive tech — announcing them every second
     * would talk over the game — so the label carries the reading instead.
     *
     * `role="timer"` is load-bearing: aria-label is ignored on a generic element,
     * and both wrappers here are generic. Without the role the label is dropped
     * and, since the digits are hidden, the timer announces nothing at all.
     * `timer` also defaults to aria-live="off", so it does not narrate.
     */
    const label = startedAt === null ? 'Timer not started' : `Elapsed time ${value}`;

    if (variant === 'hud') {
        return (
            <p className="text-pixel-sm whitespace-nowrap" role="timer" aria-label={label}>
                <span aria-hidden="true">⏱ {value}</span>
            </p>
        );
    }

    return (
        <Panel centered className="mt-4" role="timer" aria-label={label}>
            <p className="text-pixel-md m-0" aria-hidden="true">
                ⏱ {value}
            </p>
        </Panel>
    );
}
