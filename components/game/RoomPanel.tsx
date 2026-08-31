'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Panel } from '@/components/ds';
import { buildJoinUrl } from '@/lib/roomLink';
import { DIALOGS, openDialog } from '@/lib/dialogs';

export interface RoomPanelProps {
    /** Desktop and mobile size the panel differently. */
    className?: string;
    /**
     * Centres the body AND the title knocked out of the top border. A
     * `text-center` class only does the former and leaves the title hard left.
     */
    centered?: boolean;
    /**
     * Presence of this prop is what shows the invite button; the DIALOG it
     * opens is Grid's, mounted once. Absent on the daily, which is not a room.
     */
    inviteFriend?: (friendId: string) => void;
}

/**
 * The room code, and the way to get someone else into it. An empty co-op room is
 * the most common state a new player sees, so being alone is treated as a prompt
 * rather than as an absence.
 */
export default function RoomPanel({ className = '', centered = false, inviteFriend }: RoomPanelProps) {
    const room = useMinesweeperStore((state) => state.room);
    const mode = useMinesweeperStore((state) => state.mode);
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);

    // Co-op only: PVP's own waiting copy and gated Start button say this already.
    const isAlone = mode === 'co-op' && playerStatsInRoom.length <= 1;

    /*
     * Signed-in only, because a friend list needs an account. The link above is
     * what a guest uses, and it stays the primary way in for everybody — an
     * invite is a shortcut for the people who have already swapped codes.
     */
    const { status } = useSession();
    const canInvite = status === 'authenticated' && !!inviteFriend;

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

            {/* The BUTTON only. This panel is mounted twice — once per layout
                cluster — so the dialog it opens lives in Grid, mounted once,
                like every other dialog on this screen. Two <dialog> elements
                sharing an id is one openDialog away from opening the wrong
                one. */}
            {canInvite && (
                <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => openDialog(DIALOGS.inviteFriend)}
                    aria-label="Invite a friend to this room">
                    Invite a friend
                </Button>
            )}
        </Panel>
    );
}
