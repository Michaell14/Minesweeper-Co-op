import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { useBestTime } from '@/hooks/useBestTime';
import { formatClock } from '@/lib/gameClock';

/**
 * Your record for this board, and whether the run just finished changed it.
 *
 * The record shows whatever the outcome was, not only when you cleared the
 * board. Losing is when you most want to know what you are chasing, and an
 * earlier version of this only appeared after a clear that failed to improve —
 * so the number was invisible in almost every game that ended.
 *
 * The celebration is narrower on purpose. `bestTimeResult` is set only when a
 * board is actually CLEARED, so a loss and a win handed over by an opponent's
 * disconnect both leave the record standing and say nothing about it.
 */
export default function BestTimeNote() {
    const result = useMinesweeperStore((state) => state.bestTimeResult);
    // The win handler writes the record, so re-read once a verdict lands.
    const { best } = useBestTime(result);

    if (result?.improved) {
        return (
            <p className="text-pixel-sm text-center m-0" role="status">
                {/*
                  * Emphasis by weight and a glyph rather than colour.
                  * `--ms-intent-success` is a BUTTON FILL, and the /ds audit
                  * only covers its ink sitting on it — using it as text on the
                  * dialog surface is a pair nothing has measured, in four
                  * palettes. Bold strong ink is the text every dialog already
                  * uses, and it survives a theme change and a colour-blind
                  * reader without a new contrast row to keep passing.
                  */}
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
