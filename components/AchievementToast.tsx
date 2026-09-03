'use client'
import React from 'react';
import { Panel } from '@/components/ds';
import { useMinesweeperStore } from '@/app/store';
import { ACHIEVEMENTS } from '@/shared/achievements';

/**
 * Announces an achievement the moment the server says it was earned. Mounted
 * once in the layout, not the game page: the player can navigate away between
 * finishing and the write landing, and a toast unmounted mid-flight is a badge
 * nobody was told about. `pointer-events-none` is load-bearing: this is fixed
 * over the board, and a transparent box there would eat cells.
 */

/** How long one toast stays up: enough to read a name, not a sentence. */
const DISMISS_AFTER_MS = 5000;

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export default function AchievementToast() {
    const queue = useMinesweeperStore((s) => s.unlockedQueue);
    const dismissUnlocked = useMinesweeperStore((s) => s.dismissUnlocked);

    /*
     * One timer per id, armed once: keyed off the queue's contents so a
     * re-render cannot re-arm a running timer and make the toast permanent.
     */
    const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>());
    React.useEffect(() => {
        for (const id of queue) {
            if (timers.current.has(id)) continue;
            timers.current.set(
                id,
                setTimeout(() => {
                    timers.current.delete(id);
                    dismissUnlocked(id);
                }, DISMISS_AFTER_MS),
            );
        }
    }, [queue, dismissUnlocked]);

    React.useEffect(() => {
        const running = timers.current;
        return () => {
            running.forEach(clearTimeout);
            running.clear();
        };
    }, []);

    if (queue.length === 0) return null;

    return (
        <div
            /*
             * Centred by insets, not a `100vw` width. Like any fixed element it
             * centres on the LAYOUT viewport, so a horizontally overflowing page
             * offsets it; that is a page problem, not one to work around here.
             */
            className="fixed bottom-4 left-4 right-4 mx-auto max-w-[22rem] z-50 flex flex-col gap-2 pointer-events-none"
            /* Polite, not assertive: good news must not interrupt a screen reader mid-cell. */
            role="status"
            aria-live="polite">
            {queue.map((id) => {
                const achievement = byId.get(id);
                // A server one release ahead: render nothing rather than the raw slug.
                if (!achievement) return null;
                // One short word: Panel knocks the title out of the top border,
                // and a longer one wraps across the frame.
                return (
                    <Panel key={id} title="Unlocked" className="transition-opacity duration-slow">
                        <p className="text-pixel-sm m-0">🏆 {achievement.name}</p>
                        <p className="text-pixel-2xs text-ink-muted mt-2 mb-0">{achievement.description}</p>
                    </Panel>
                );
            })}
        </div>
    );
}
