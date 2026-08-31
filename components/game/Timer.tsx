import React, { useEffect, useState } from 'react';
import { useMinesweeperStore } from '@/app/store';
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
     * Where it is being shown, matching FlagCounter:
     *   bar -> bare, larger type  (desktop HUD, on the board's edge)
     *   hud -> bare, small type   (mobile sticky bar, daily row)
     */
    variant: 'bar' | 'hud';
}

/** How long the current run has been going. Frozen once it ends. */
export default function Timer({ variant }: TimerProps) {
    const startedAt = useMinesweeperStore((state) => state.startedAt);
    const endedAt = useMinesweeperStore((state) => state.endedAt);
    const showTimer = useMinesweeperStore((state) => state.settings.showTimer);
    const seconds = useElapsedSeconds(startedAt, endedAt);

    // The HUD setting. The run still times — the end-of-game summary reports
    // it from the same timestamps — the player just doesn't watch it tick.
    if (!showTimer) return null;

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
