"use client";

import React from 'react';

/** The dismissable strip above the title. Owns its own visibility. */
export default function AnnouncementBanner() {
    const [visible, setVisible] = React.useState(true);
    if (!visible) return null;

    return (
        <div
            className="bg-surface-banner text-ink-banner px-4 py-2 text-center relative flex items-center justify-center"
            role="banner"
            aria-label="Website milestone announcement">
            <p className="text-pixel-2xs md:text-pixel-sm m-0">
                Daily Challenge just dropped! One board, everyone plays it, ranked by time. Got feedback?{' '}
                <a
                    href="https://forms.gle/ALpScH8K7K2QsA8M7"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-ink-muted-hover">
                    Tell us!
                </a>
            </p>
            <button
                onClick={() => setVisible(false)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-banner hover:text-ink-muted-hover font-bold text-pixel-lg leading-none"
                aria-label="Close banner">
                ×
            </button>
        </div>
    );
}
