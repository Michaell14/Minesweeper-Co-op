"use client";

import React from 'react';
import { useBestTime } from '@/hooks/useBestTime';
import { formatClock } from '@/lib/gameClock';

/**
 * Your record on the board currently selected, shown before you play it.
 *
 * A best time only visible in the end-of-game dialog is a record you never see,
 * which is most of the reason to have one. Here it is a target while you are
 * still choosing what to play.
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
