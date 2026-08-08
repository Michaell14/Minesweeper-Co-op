'use client'
import React from 'react';
import { Panel } from '@/components/ds';
import { useMinesweeperStore } from '@/app/store';
import { ACHIEVEMENTS } from '@/shared/achievements';

/**
 * Announces an achievement the moment the server says it was earned.
 *
 * Mounted once in the layout rather than on the game page: the queue is only
 * ever filled by the socket handler, which lives on `/` and `/daily`, but the
 * player can navigate away in the second between finishing and the write
 * landing — and a toast that unmounted mid-flight would be a badge nobody was
 * ever told about.
 *
 * `pointer-events-none` on the container is load-bearing, not tidiness. This is
 * fixed over the board on a page whose whole content is a click target, and a
 * transparent box across the bottom of it would eat cells.
 */

/** How long one toast stays up. Long enough to read a name, not a sentence. */
const DISMISS_AFTER_MS = 5000;

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export default function AchievementToast() {
    const queue = useMinesweeperStore((s) => s.unlockedQueue);
    const dismissUnlocked = useMinesweeperStore((s) => s.dismissUnlocked);

    /*
     * One timer per id, armed once. Keyed off the queue's contents rather than
     * its identity so a re-render cannot re-arm a timer that is already
     * running — that is what turns a 5s toast into a permanent one under a
     * chatty store.
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
             * Centred by insets rather than a `100vw` width, so the box is
             * sized by the margins it must keep and never by viewport maths.
             * Like any fixed element it centres on the LAYOUT viewport, so a
             * page that overflows horizontally offsets it — the footer cluster
             * included, which is why that is a page problem to fix, not one to
             * work around here.
             */
            className="fixed bottom-4 left-4 right-4 mx-auto max-w-[22rem] z-50 flex flex-col gap-2 pointer-events-none"
            /* Polite, not assertive: an unlock is good news arriving mid-game,
               and it must not interrupt a screen reader mid-cell. */
            role="status"
            aria-live="polite">
            {queue.map((id) => {
                const achievement = byId.get(id);
                // An id this build's catalog does not know — a server one
                // release ahead. Nothing sensible to render, so render nothing
                // rather than the raw slug.
                if (!achievement) return null;
                // One short word for the title: Panel knocks it out of the top
                // border, and "Achievement unlocked" wrapped to two lines with
                // the second sitting across the frame.
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
