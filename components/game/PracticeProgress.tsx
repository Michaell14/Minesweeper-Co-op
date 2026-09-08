"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Panel } from '@/components/ds';
import ProgressBar from '@/components/game/ProgressBar';
import { useGameStats } from '@/hooks/useGameStats';
import { targetPercent } from '@/lib/practice';
import { formatElapsed } from '@/lib/gameClock';

/**
 * The practice race's two bars: yours and the target's. The target has no
 * server behind it: a practice race is a co-op room of one, and this bar is
 * drawn from the run clock against a time out of this browser's records.
 * Separate from Grid's PVP block, which reads PVP fields a co-op room lacks.
 */
export interface PracticeProgressProps {
    /** panel -> boxed, desktop side column. mobile -> bare bars under the board. */
    variant: 'panel' | 'mobile';
}

/**
 * The target's fill, re-derived each tick. Faster than the timer's once a
 * second because a second's jump is visible on a bar. Stops once the run ends.
 */
const useTargetPercent = (startedAt: number | null, endedAt: number | null, targetMs: number) => {
    const [percent, setPercent] = React.useState(() => targetPercent(startedAt, endedAt, targetMs));

    React.useEffect(() => {
        const tick = () => setPercent(targetPercent(startedAt, endedAt, targetMs));
        tick();

        if (startedAt === null || endedAt !== null) return;
        const id = setInterval(tick, 250);
        return () => clearInterval(id);
    }, [startedAt, endedAt, targetMs]);

    return percent;
};

export default function PracticeProgress({ variant }: PracticeProgressProps) {
    const practiceTargetMs = useMinesweeperStore((state) => state.practiceTargetMs);
    const isPersonal = useMinesweeperStore((state) => state.practiceTargetIsPersonal);
    const startedAt = useMinesweeperStore((state) => state.startedAt);
    const endedAt = useMinesweeperStore((state) => state.endedAt);
    const showProgressBar = useMinesweeperStore((state) => state.settings.showProgressBar);
    const { ownProgressPercent } = useGameStats();

    const target = useTargetPercent(startedAt, endedAt, practiceTargetMs ?? 0);

    // Hooks first: this returns early.
    if (practiceTargetMs === null || !showProgressBar) return null;

    // Not an "opponent": that is the one lie this feature avoids (ARCHITECTURE.md §5).
    const targetLabel = isPersonal ? 'Your best' : 'Par';
    const targetTime = formatElapsed(practiceTargetMs);

    const bars = (size: 'sm' | 'md') => (
        <>
            <div className={size === 'md' ? 'mb-4' : 'mb-2'}>
                <ProgressBar
                    label="You"
                    percent={ownProgressPercent}
                    colorClass="bg-progress-own"
                    size={size}
                    ariaLabel={size === 'md' ? `Your progress: ${ownProgressPercent}%` : undefined}
                    boldPercent={size === 'md'}
                />
            </div>
            <div className={size === 'md' ? 'mb-2' : undefined}>
                <ProgressBar
                    label={targetLabel}
                    percent={target}
                    colorClass="bg-progress-opponent"
                    size={size}
                    ariaLabel={size === 'md' ? `Target progress: ${target}%` : undefined}
                    boldPercent={size === 'md'}
                />
            </div>
        </>
    );

    if (variant === 'mobile') {
        return <div className="w-full max-w-60 mb-4">{bars('sm')}</div>;
    }

    return (
        <Panel
            title={<span className="text-pixel-sm">Progress</span>}
            className="max-w-60 mt-6"
            role="region"
            aria-label="Practice race progress">
            {bars('md')}
            <p className="text-pixel-sm mt-3">
                Beat {targetTime}
            </p>
        </Panel>
    );
}
