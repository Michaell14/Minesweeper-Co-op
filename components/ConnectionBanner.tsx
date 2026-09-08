"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';

/** Drops shorter than this stay silent: socket.io repairs most blips in under a second. */
const SHOW_DELAY_MS = 1500;

/**
 * The only honest answer to "is anything happening?". Every error dialog is a
 * server event, so a dead backend would otherwise look like a working app that
 * ignores clicks. Mounted on every route that owns a socket; reads
 * connectionSlice. 'unreachable' shows with no delay: a failed dial already
 * happened, and there is no game in progress.
 */
export default function ConnectionBanner() {
    const status = useMinesweeperStore((state) => state.connectionStatus);
    const [visible, setVisible] = React.useState(false);

    React.useEffect(() => {
        if (status === 'connected' || status === 'connecting') {
            setVisible(false);
            return;
        }
        if (status === 'unreachable') {
            setVisible(true);
            return;
        }
        const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        return () => clearTimeout(timer);
    }, [status]);

    if (!visible) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            /*
             * BOTTOM, not top: the site header and the mobile HUD are up there.
             * Overlaps AchievementToast in principle only.
             */
            className="fixed inset-x-0 bottom-0 z-50 bg-surface-banner text-ink-banner border-t-pixel border-edge px-4 py-2 text-center text-pixel-2xs md:text-pixel-sm">
            {status === 'unreachable'
                ? "Can't reach the server — retrying. It may be waking up."
                : 'Connection lost — reconnecting…'}
        </div>
    );
}
