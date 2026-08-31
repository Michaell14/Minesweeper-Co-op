"use client";

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { useCellMetrics } from './useCellMetrics';
import { cursorColorForId } from '@/lib/theme';
import { PING_LIFETIME_MS, pingAnnouncement } from '@/lib/emotes';
import styles from './board.module.css';

interface PingLayerProps {
    boardRef: React.RefObject<HTMLDivElement | null>;
}

/** How long until the earliest ring is due. See EmoteBar for the same shape. */
const delayUntilNextExpiry = (pings: { expiresAt: number }[]): number => {
    const soonest = Math.min(...pings.map((ping) => ping.expiresAt));
    return Math.max(0, Math.min(soonest - Date.now(), PING_LIFETIME_MS));
};

/**
 * Rings on the cells people are pointing at — a sibling of CursorLayer, sharing
 * its cell-to-pixel maths and its reason for existing at this level: a ping
 * moves nothing about a cell, so drawing it here re-renders zero of them.
 *
 * Co-op only in practice; the server never sends a ping from a PVP room.
 *
 * The live region is this layer's own, in the same words `cellAriaLabel` uses
 * for a cell, because the ring itself is decorative and a screen reader would
 * otherwise be told nothing at all.
 */
export default function PingLayer({ boardRef }: PingLayerProps) {
    const playerPings = useMinesweeperStore((state) => state.playerPings);
    const expirePlayerPings = useMinesweeperStore((state) => state.expirePlayerPings);
    const metrics = useCellMetrics(boardRef);

    /*
     * Re-armed by the callback, not by the state it changed — expiring nothing
     * leaves the array identity alone, and an effect that depended on it would
     * stop and strand the ring. Same rule, and the same reason, as EmoteBar.
     */
    React.useEffect(() => {
        if (playerPings.length === 0) return;

        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            expirePlayerPings(Date.now());
            const live = useMinesweeperStore.getState().playerPings;
            if (live.length > 0) timer = setTimeout(tick, delayUntilNextExpiry(live));
        };

        timer = setTimeout(tick, delayUntilNextExpiry(playerPings));
        return () => clearTimeout(timer);
    }, [playerPings, expirePlayerPings]);

    const stride = metrics.size + metrics.gap;
    const latest = playerPings[playerPings.length - 1];

    return (
        <>
            {playerPings.map((ping) => (
                <div
                    key={ping.key}
                    className={styles.pingRing}
                    data-ping
                    aria-hidden="true"
                    style={{
                        transform: `translate(${metrics.gap + ping.col * stride}px, ${metrics.gap + ping.row * stride}px)`,
                        width: metrics.size,
                        height: metrics.size,
                        '--cursor-color': cursorColorForId(ping.id),
                    } as React.CSSProperties}
                >
                    <span className={styles.pingLabel}>{ping.name}</span>
                </div>
            ))}
            {/* Mounted whether or not anything is pinging, so the first
                announcement is not lost to a region that appeared with its
                text — the same reason KeyboardCursor keeps its region up. */}
            <div className="sr-only" role="status" aria-live="polite" data-ping-announcer>
                {latest ? pingAnnouncement(latest.name, latest.row, latest.col) : ''}
            </div>
        </>
    );
}
