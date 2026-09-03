"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { useBestTime } from '@/hooks/useBestTime';
import { formatClock } from '@/lib/gameClock';

/**
 * Your record for this board, and whether this run changed it. The record
 * shows on any outcome; the celebration only on an actual clear, since
 * `bestTimeResult` is set nowhere else.
 */
export default function BestTimeNote() {
    const result = useMinesweeperStore((state) => state.bestTimeResult);
    // Re-read once a verdict lands: the win handler writes the record.
    const { best } = useBestTime(result);

    if (result?.improved) {
        return (
            <p className="text-pixel-sm text-center m-0" role="status">
                {/* Weight and a glyph, not colour: `--ms-intent-success` is a button
                    fill, and the /ds audit only covers its ink sitting on it. */}
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
