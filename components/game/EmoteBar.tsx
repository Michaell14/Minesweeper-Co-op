'use client';

import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Emote, PingIcon } from '@/components/ds';
import { EMOTES } from '@/shared/emotes';
import { EMOTE_LIFETIME_MS, emoteAnnouncement } from '@/lib/emotes';
import type { PlayerEmote } from '@/state/types';
import styles from './emotes.module.css';

export interface EmoteBarProps {
    sendEmote: (emote: string) => void;
}

/**
 * The reaction tray and the feed, in one mount under the board: the feed is
 * positioned against the tray, so a reaction never covers the button that sent
 * it. `settings.emotes` is applied on the RECEIVE path (hooks/useGameEvents.ts),
 * so an opted-out player has an empty feed and a working tray.
 */
/**
 * Delay to the earliest deadline: capped at a lifetime so a nonsense
 * `expiresAt` cannot park the loop, floored at zero so a past one fires next tick.
 */
const delayUntilNextExpiry = (emotes: PlayerEmote[]): number => {
    const soonest = Math.min(...emotes.map((emote) => emote.expiresAt));
    return Math.max(0, Math.min(soonest - Date.now(), EMOTE_LIFETIME_MS));
};

export default function EmoteBar({ sendEmote }: EmoteBarProps) {
    const playerEmotes = useMinesweeperStore((state) => state.playerEmotes);
    const expirePlayerEmotes = useMinesweeperStore((state) => state.expirePlayerEmotes);
    const pingArmed = useMinesweeperStore((state) => state.pingArmed);
    const setPingArmed = useMinesweeperStore((state) => state.setPingArmed);
    // A race has nobody to point at (same board), and the server refuses a ping there.
    const mode = useMinesweeperStore((state) => state.mode);

    /*
     * One timer for the whole feed, armed at the earliest deadline and
     * RE-ARMED BY THE CALLBACK rather than by the state it changed:
     * `expirePlayerEmotes` is a no-op when nothing has expired, leaving the
     * same array identity, so an effect re-arming from its dependency would
     * stop and the chip would sit. Not hypothetical: `setTimeout` runs off a
     * monotonic clock while the deadline is `Date.now()`, so the callback can
     * fire a millisecond early. The loop ends when the store is empty, which
     * it always reaches since every surviving delay is positive and smaller.
     */
    React.useEffect(() => {
        if (playerEmotes.length === 0) return;

        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            expirePlayerEmotes(Date.now());
            // Read back rather than the closure: the state the call above just produced.
            const live = useMinesweeperStore.getState().playerEmotes;
            if (live.length > 0) timer = setTimeout(tick, delayUntilNextExpiry(live));
        };

        timer = setTimeout(tick, delayUntilNextExpiry(playerEmotes));
        return () => clearTimeout(timer);
    }, [playerEmotes, expirePlayerEmotes]);

    const latest = playerEmotes[playerEmotes.length - 1];

    return (
        /* The gap has to clear the feed: chips are positioned above the tray,
           so too small a margin floats them over the board's bottom row. */
        <div className="relative mt-12 flex justify-center">
            {/* Decorative: the live region below announces the same reactions as text. */}
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
                {mode !== 'pvp' && (
                    /*
                     * Arms one ping. `aria-pressed` is the only thing telling a
                     * screen reader the board is in a different mode, and the
                     * label moves with it so the toggle does not read as dead.
                     */
                    <Button
                        size="sm"
                        intent={pingArmed ? 'primary' : 'default'}
                        aria-pressed={pingArmed}
                        aria-label={pingArmed ? 'Cancel ping' : 'Ping a cell'}
                        title="Point at a cell — or hold Shift and click one"
                        onClick={() => setPingArmed(!pingArmed)}>
                        <PingIcon size={24} />
                    </Button>
                )}
            </div>

            {/* Polite, not assertive: a reaction is somebody saying hello, not an interruption. */}
            <div aria-live="polite" aria-atomic="true" className="sr-only">
                {latest ? emoteAnnouncement(latest.name, latest.emote) : ''}
            </div>
        </div>
    );
}
