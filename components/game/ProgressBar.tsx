import React from 'react';

export interface ProgressBarProps {
    label: string;
    percent: number;
    /** Fill class. Must be a `bg-progress-*` token class, or it survives a theme change. */
    colorClass: string;
    /** Desktop bars are taller and carry ARIA; mobile bars are compact. */
    size?: 'sm' | 'md';
    ariaLabel?: string;
    boldPercent?: boolean;
}

/**
 * One labelled progress bar, used for both PVP players. The show/hide setting
 * is applied by Grid.tsx: hiding only the bars would leave an empty titled panel.
 */
export default function ProgressBar({ label, percent, colorClass, size = 'md', ariaLabel, boldPercent }: ProgressBarProps) {
    const track = size === 'md' ? 'w-full bg-surface-track rounded h-4 overflow-hidden' : 'w-full bg-surface-track rounded h-3';

    return (
        <>
            <p className="text-pixel-sm mb-1">
                {label}: {boldPercent ? <strong>{percent}%</strong> : `${percent}%`}
            </p>
            <div className={track}>
                <div
                    className={`${colorClass} h-full transition-all duration-slow`}
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

/** Bar colour follows the opponent's state. */
export const opponentBarColor = (status: string) =>
    status === 'failed' ? 'bg-progress-failed' : status === 'won' ? 'bg-progress-won' : 'bg-progress-opponent';
