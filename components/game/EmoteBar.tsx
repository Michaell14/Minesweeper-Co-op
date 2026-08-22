'use client';

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Emote } from '@/components/ds';
import { EMOTES } from '@/shared/emotes';
import { EMOTE_LIFETIME_MS, emoteAnnouncement } from '@/lib/emotes';
import type { PlayerEmote } from '@/state/types';
import styles from './emotes.module.css';

export interface EmoteBarProps {
    sendEmote: (emote: string) => void;
}

/**
 * The reaction tray, and the feed of what everyone just sent.
 *
 * One component and one mount for both halves, sitting under the board in both
 * layouts — the feed is positioned against the tray, so keeping them together
 * is what stops a reaction ever covering the button that sent it.
 *
 * Nothing here is gated on `settings.emotes`: the opt-out is applied on the
 * RECEIVE path (hooks/useGameEvents.ts), so an opted-out player has an empty
 * feed and a working tray, which is exactly what the setting says.
 */
/**
 * How long until the earliest deadline. Capped at a whole lifetime so a
 * nonsense `expiresAt` cannot park the loop indefinitely, floored at zero so a
 * deadline already past fires on the next tick.
 */
const delayUntilNextExpiry = (emotes: PlayerEmote[]): number => {
    const soonest = Math.min(...emotes.map((emote) => emote.expiresAt));
    return Math.max(0, Math.min(soonest - Date.now(), EMOTE_LIFETIME_MS));
};

export default function EmoteBar({ sendEmote }: EmoteBarProps) {
    const playerEmotes = useMinesweeperStore((state) => state.playerEmotes);
    const expirePlayerEmotes = useMinesweeperStore((state) => state.expirePlayerEmotes);

    /*
     * One timer for the whole feed, armed at the earliest deadline rather than
     * one per chip, and RE-ARMED BY THE CALLBACK rather than by the state it
     * changed.
     *
     * That distinction is the whole reason this is a loop. `expirePlayerEmotes`
     * is a no-op when nothing has expired, which leaves `playerEmotes` at the
     * same array identity — so an effect that re-armed from its own dependency
     * would simply stop, and the chip would sit there until the next reaction
     * arrived. Not hypothetical: `setTimeout` is scheduled off a monotonic
     * clock while the deadline is compared against `Date.now()`, so the
     * callback can run a millisecond before the wall clock agrees it is due
     * (and a wall clock stepped backwards mid-window does it decisively).
     *
     * The loop ends when the store is empty, which it always reaches: anything
     * that survives the filter has a deadline still in the future, so the next
     * delay is positive and strictly smaller.
     */
    React.useEffect(() => {
        if (playerEmotes.length === 0) return;

        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            expirePlayerEmotes(Date.now());
            // Read back rather than trusting the closure: this is the state the
            // call above just produced.
            const live = useMinesweeperStore.getState().playerEmotes;
            if (live.length > 0) timer = setTimeout(tick, delayUntilNextExpiry(live));
        };

        timer = setTimeout(tick, delayUntilNextExpiry(playerEmotes));
        return () => clearTimeout(timer);
    }, [playerEmotes, expirePlayerEmotes]);

    const latest = playerEmotes[playerEmotes.length - 1];

    return (
        /* The gap has to clear the feed, not just look right: chips are
           positioned above the tray, so too small a margin floats them over the
           board's bottom row. */
        <div className="relative mt-12 flex justify-center">
            {/* Decorative: the same reactions reach a screen reader through the
                live region below, where they arrive as text rather than as a
                pile of unlabelled glyphs. */}
            <div className={styles.feed} aria-hidden="true">
                {playerEmotes.map((emote) => (
                    <span key={emote.key} className={styles.chip}>
                        <Emote id={emote.emote} size={20} />
                        <span className={`text-pixel-xs ${styles.name}`}>{emote.name}</span>
                    </span>
                ))}
            </div>

            <div className="flex flex-wrap justify-center gap-1" role="group" aria-label="Send a reaction">
                {EMOTES.map(({ id, label }) => (
                    <Button key={id} size="sm" aria-label={label} onClick={() => sendEmote(id)}>
                        <Emote id={id} size={24} />
                    </Button>
                ))}
            </div>

            {/*
              * Polite, not assertive: a reaction is somebody saying hello, and
              * interrupting whatever is being read to deliver one would make
              * the feature hostile to the people most likely to leave it on.
              */}
            <div aria-live="polite" aria-atomic="true" className="sr-only">
                {latest ? emoteAnnouncement(latest.name, latest.emote) : ''}
            </div>
        </div>
    );
}
