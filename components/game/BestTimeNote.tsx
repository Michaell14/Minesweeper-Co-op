"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { useBestTime } from '@/hooks/useBestTime';
import { formatClock } from '@/lib/gameClock';

/**
 * Your record for this board, and whether the run just finished changed it.
 *
 * The record shows on any outcome, not just a clear — losing is when you most
 * want to know what you are chasing. The celebration is narrower on purpose:
 * `bestTimeResult` is set only on an actual CLEAR, so a loss and a win handed
 * over by a disconnect both leave the record standing and say nothing.
 */
export default function BestTimeNote() {
    const result = useMinesweeperStore((state) => state.bestTimeResult);
    // The win handler writes the record, so re-read once a verdict lands.
    const { best } = useBestTime(result);

    if (result?.improved) {
        return (
            <p className="text-pixel-sm text-center m-0" role="status">
                {/* Weight and a glyph rather than colour: `--ms-intent-success`
                    is a BUTTON FILL, and the /ds audit only covers its ink
                    sitting on it, so using it as text here is an unmeasured pair
                    in four palettes. */}
                <strong>🏆 New best!</strong>
                {result.previous && (
                    <span className="text-ink-muted"> Beat {formatClock(result.previous.seconds)}.</span>
                )}
            </p>
        );
    }

    if (!best) return null;

    return (
        <p className="text-pixel-sm text-center text-ink-muted m-0" role="status">
            Best {formatClock(best.seconds)}
            {best.players > 1 && ` with ${best.players} players`}.
        </p>
    );
}
