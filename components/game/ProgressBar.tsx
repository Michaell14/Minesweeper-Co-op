import React from 'react';

export interface ProgressBarProps {
    label: string;
    percent: number;
    /**
     * Background class for the filled portion. Must be a `bg-progress-*`
     * token class — a raw palette class (`bg-blue-500`) would survive a theme
     * change while everything around it moved.
     */
    colorClass: string;
    /** Desktop bars are taller and carry ARIA; mobile bars are compact. */
    size?: 'sm' | 'md';
    ariaLabel?: string;
    boldPercent?: boolean;
}

/** One labelled progress bar, used for both players in PVP. */
export default function ProgressBar({ label, percent, colorClass, size = 'md', ariaLabel, boldPercent }: ProgressBarProps) {
    const track = size === 'md' ? 'w-full bg-surface-track rounded h-4 overflow-hidden' : 'w-full bg-surface-track rounded h-3';

    return (
        <>
            <p className="text-pixel-sm mb-1">
                {label}: {boldPercent ? <strong>{percent}%</strong> : `${percent}%`}
            </p>
            <div className={track}>
                <div
                    className={`${colorClass} h-full transition-all duration-300`}
                    style={{ width: `${percent}%` }}
                    {...(ariaLabel
                        ? {
                            role: 'progressbar',
                            'aria-valuenow': percent,
                            'aria-valuemin': 0,
                            'aria-valuemax': 100,
                            'aria-label': ariaLabel,
                        }
                        : {})}
                />
            </div>
        </>
    );
}

/** Bar colour follows the opponent's state, matching the previous inline logic. */
export const opponentBarColor = (status: string) =>
    status === 'failed' ? 'bg-progress-failed' : status === 'won' ? 'bg-progress-won' : 'bg-progress-opponent';
