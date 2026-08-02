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
 * The room code, and the way to get someone else into it. An empty co-op room is
 * the most common state a new player sees, so being alone is treated as a prompt
 * rather than as an absence.
 */
export default function RoomPanel({ className = '', centered = false }: RoomPanelProps) {
    const room = useMinesweeperStore((state) => state.room);
    const mode = useMinesweeperStore((state) => state.mode);
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);

    // Co-op only: PVP's own waiting copy and gated Start button say this already.
    const isAlone = mode === 'co-op' && playerStatsInRoom.length <= 1;

    const [linkCopied, setLinkCopied] = React.useState(false);
    const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cancels the pending "reset to Copy Link" timer if the panel unmounts first.
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
            {/* aria-live on the button itself is unreliable -- screen readers do
                not consistently treat an interactive control as a live region,
                and its aria-label never changes anyway. */}
            <span className="sr-only" aria-live="polite">
                {linkCopied ? 'Link copied to clipboard' : ''}
            </span>
        </Panel>
    );
}
