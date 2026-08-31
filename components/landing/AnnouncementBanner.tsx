"use client";

import React from 'react';
import Link from 'next/link';
import { LATEST_ENTRY, dismissBanner, isBannerDismissed } from '@/lib/changelog';

/**
 * The dismissable strip above the title.
 *
 * Copy is DERIVED from the newest changelog entry, never written here — the
 * hardcoded version outlived the release it announced by five entries.
 * Dismissal is per-entry (lib/changelog.ts), so closing it lasts until there is
 * genuinely something new to say.
 */
export default function AnnouncementBanner() {
    // Starts hidden so the first client render matches SSR; the strip appears
    // after mount, once storage has been read.
    const [visible, setVisible] = React.useState(false);

    React.useEffect(() => {
        if (!isBannerDismissed()) setVisible(true);
    }, []);

    const close = () => {
        dismissBanner();
        setVisible(false);
    };

    if (!visible || !LATEST_ENTRY) return null;

    return (
        <div
            className="bg-surface-banner text-ink-banner px-4 py-2 text-center relative flex items-center justify-center"
            role="region"
            aria-label="What's new">
            <p className="text-pixel-2xs md:text-pixel-sm m-0 pr-6">
                <strong>{LATEST_ENTRY.tag}: {LATEST_ENTRY.title}</strong>{' '}
                {LATEST_ENTRY.bullets[0]}{' '}
                <Link href="/changelog" className="underline hover:text-ink-muted-hover">
                    See what&apos;s new
                </Link>
            </p>
            <button
                onClick={close}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-banner hover:text-ink-muted-hover font-bold text-pixel-lg leading-none"
                aria-label="Dismiss announcement">
                ×
            </button>
        </div>
    );
}
