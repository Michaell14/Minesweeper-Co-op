import React from 'react';
import { Panel, Sprite } from '@/components/ds';
import { useMinesweeperStore } from '@/app/store';

export interface FlagCounterProps {
    remainingFlags: number;
    /**
     * Where it is being shown:
     *   bar    -> bare, larger type        (desktop HUD, on the board's edge)
     *   hud    -> bare, small type         (mobile sticky bar, daily row)
     *   dialog -> boxed, "N left"          (mobile players dialog)
     */
    variant: 'bar' | 'dialog' | 'hud';
}

/** Mines remaining, i.e. total mines minus flags placed. */
export default function FlagCounter({ remainingFlags, variant }: FlagCounterProps) {
    const showFlagCounter = useMinesweeperStore((state) => state.settings.showFlagCounter);
    const label = `${remainingFlags} flags remaining`;

    // The HUD setting hides the LIVE counter only; the dialog variant is part
    // of the end-of-game summary, which is a report, not a HUD.
    if (!showFlagCounter && variant !== 'dialog') return null;

    /* No panel chrome on either bar — the board is already the framed region. */
    if (variant !== 'dialog') {
        // Flex, not an inline glyph: the sprite is a box with its own margin
        // and would otherwise ride above the digits.
        return (
            <p
                className={`${variant === 'bar' ? 'text-pixel-md' : 'text-pixel-sm'} whitespace-nowrap flex items-center gap-1`}
                role="status"
                aria-label={label}>
                <Sprite kind="flag" /><strong>{remainingFlags}</strong>
            </p>
        );
    }

    return (
        <Panel centered className="mt-4 py-1" role="status" aria-label={label}>
            <p className="text-pixel-md m-0 flex items-center justify-center gap-1">
                <Sprite kind="flag" /><strong>{remainingFlags}</strong><span>left</span>
            </p>
        </Panel>
    );
}
