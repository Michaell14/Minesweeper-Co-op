import React from 'react';

export interface FlagCounterProps {
    remainingFlags: number;
    /**
     * The three places this appears do not agree, and did not before either:
     *   panel  -> boxed, just the number          (desktop side panel)
     *   dialog -> boxed, "N left"                 (mobile players dialog)
     *   inline -> plain centred text, "N left"    (mobile PVP progress block)
     */
    variant: 'panel' | 'dialog' | 'inline';
}

/** Mines remaining, i.e. total mines minus flags placed. */
export default function FlagCounter({ remainingFlags, variant }: FlagCounterProps) {
    const label = `${remainingFlags} flags remaining`;

    if (variant === 'inline') {
        return (
            <p className="text-xs mt-4 text-center" role="status" aria-label={label}>
                🚩 <strong>{remainingFlags}</strong> left
            </p>
        );
    }

    const boxClass = variant === 'dialog'
        ? 'bg-slate-100 nes-container is-centered mt-4 py-1'
        : 'bg-slate-100 nes-container is-centered mt-4';

    return (
        <div className={boxClass} role="status" aria-label={label}>
            <p className="text-sm m-0">
                🚩 <strong>{remainingFlags}</strong>{variant === 'dialog' ? ' left' : ''}
            </p>
        </div>
    );
}
