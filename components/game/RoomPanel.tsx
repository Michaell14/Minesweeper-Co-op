import React from 'react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Panel } from '@/components/ds';
import { buildJoinUrl } from '@/lib/roomLink';

export interface RoomPanelProps {
    /** Desktop and mobile size the panel differently. */
    className?: string;
    /**
     * Centres the body AND the title knocked out of the top border. A
     * `text-center` class only does the former and leaves the title hard left.
     */
    centered?: boolean;
}

/**
 * The room code, and the way to get someone else into it.
 *
 * A co-op room with nobody else in it is the most common state a new player
 * sees, and it used to look identical to a full one: a code, a Copy Link
 * button, and no indication that the game is meant for more than one person.
 * Being alone is treated as a prompt here rather than as an absence.
 */
export default function RoomPanel({ className = '', centered = false }: RoomPanelProps) {
    const room = useMinesweeperStore((state) => state.room);
    const mode = useMinesweeperStore((state) => state.mode);
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);

    /*
     * PVP has its own waiting-for-opponent copy and a Start button gated on the
     * second player, so it says all of this already.
     */
    const isAlone = mode === 'co-op' && playerStatsInRoom.length <= 1;

    const [linkCopied, setLinkCopied] = React.useState(false);
    const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cancels the pending "reset to Copy Link" timer if the panel unmounts first
    // (e.g. leaving the room within 2s of copying).
    React.useEffect(() => () => {
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    }, []);

    const copyRoomLink = React.useCallback(async () => {
        try {
            await navigator.clipboard.writeText(buildJoinUrl(room));
            setLinkCopied(true);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
        } catch {
            // Clipboard denied/unavailable — button just stays "Copy Link".
        }
    }, [room]);

    return (
        <Panel
            title={<span className="text-pixel-sm">{isAlone ? 'Invite a friend' : 'Room:'}</span>}
            centered={centered}
            className={className}
            role="region"
            aria-label="Room information">
            <p className="text-pixel-md" aria-label={`Room code: ${room}`}> {room}</p>

            {isAlone && (
                <p className="text-pixel-2xs text-ink-muted mt-2 mb-0">
                    You&apos;re the only one here. Send this link and sweep together.
                </p>
            )}

            <Button
                intent="primary"
                size="sm"
                className="mt-2"
                onClick={copyRoomLink}
                aria-label="Copy shareable room link to clipboard">
                {linkCopied ? 'Copied!' : 'Copy Link'}
            </Button>
            {/*
              * aria-live on the button itself is unreliable -- screen readers
              * don't consistently treat an interactive control as a live
              * region, and its aria-label above never changes anyway. A
              * dedicated hidden region is the pattern that actually gets
              * announced.
              */}
            <span className="sr-only" aria-live="polite">
                {linkCopied ? 'Link copied to clipboard' : ''}
            </span>
        </Panel>
    );
}
