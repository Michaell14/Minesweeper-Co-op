"use client";

import React from 'react';
import { useBestTime } from '@/hooks/useBestTime';
import { formatClock } from '@/lib/gameClock';

/**
 * Your record on the board currently selected. Always the SOLO record: nobody
 * has joined yet, and a group's time is a different result (lib/bestTimes.ts).
 */
export default function BestForBoard() {
    const { best, label } = useBestTime();
    if (!best) return null;

    return (
        <p className="text-pixel-2xs text-ink-muted mt-2 mb-0" role="status">
            Your best on {label}: {formatClock(best.seconds)}
        </p>
    );
}
