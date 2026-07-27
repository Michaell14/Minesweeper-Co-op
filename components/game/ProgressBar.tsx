import React from 'react';

export interface ProgressBarProps {
    label: string;
    percent: number;
    /** Tailwind background class for the filled portion. */
    colorClass: string;
    /** Desktop bars are taller and carry ARIA; mobile bars are compact. */
    size?: 'sm' | 'md';
    ariaLabel?: string;
    boldPercent?: boolean;
}

/** One labelled progress bar, used for both players in PVP. */
export default function ProgressBar({ label, percent, colorClass, size = 'md', ariaLabel, boldPercent }: ProgressBarProps) {
    const track = size === 'md' ? 'w-full bg-gray-300 rounded h-4 overflow-hidden' : 'w-full bg-gray-300 rounded h-3';

    return (
        <>
            <p className="text-xs mb-1">
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
    status === 'failed' ? 'bg-red-500' : status === 'won' ? 'bg-green-500' : 'bg-orange-500';
