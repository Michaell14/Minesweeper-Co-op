"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';

/**
 * How long a drop must last before the banner appears. socket.io usually
 * repairs a blip in under a second, and a banner that flashes on every one
 * teaches players to ignore it.
 */
const SHOW_DELAY_MS = 1500;

/**
 * The app's only honest answer to "is anything happening?".
 *
 * Every error dialog arrives as a server event, so none of them can fire when
 * the server itself is unreachable — without this, a dead backend looks like a
 * working app that ignores clicks. Mounted on every route that owns a socket
 * (`/` and `/daily`); reads connectionSlice, which useConnectionStatus feeds.
 *
 * 'unreachable' shows with no delay: it already took a failed dial to get
 * there, and there is no game in progress to be precious about.
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
            className="fixed inset-x-0 top-0 z-50 bg-surface-banner text-ink-banner border-b-pixel border-edge px-4 py-2 text-center text-pixel-2xs md:text-pixel-sm">
            {status === 'unreachable'
                ? "Can't reach the server — retrying. It may be waking up."
                : 'Connection lost — reconnecting…'}
        </div>
    );
}
