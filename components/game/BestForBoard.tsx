"use client";

import React from 'react';
import { useBestTime } from '@/hooks/useBestTime';
import { formatClock } from '@/lib/gameClock';

/**
 * Your record on the board currently selected — a target while you are still
 * choosing what to play, rather than a number only the end-of-game dialog shows.
 */
export default function BestForBoard() {
    const { best, label } = useBestTime();
    if (!best) return null;

    return (
        <p className="text-pixel-2xs text-ink-muted mt-2 mb-0" role="status">
            Your best on {label}: {formatClock(best.seconds)}
            {best.players > 1 && ` with ${best.players} players`}
        </p>
    );
}
