'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { Button, Field, Input, Panel } from '@/components/ds';
import { buildJoinUrl } from '@/lib/roomLink';
import { DIALOGS, openDialog } from '@/lib/dialogs';

export interface RoomPanelProps {
    /** Desktop and mobile size the panel differently. */
    className?: string;
    /** Centres the body AND the title in the top border; `text-center` alone leaves the title hard left. */
    centered?: boolean;
    /** Presence shows the invite button; the DIALOG is Grid's, mounted once. Absent on the daily. */
    inviteFriend?: (friendId: string) => void;
}

/**
 * The room code, and the way to get someone else into it. Being alone is the
 * commonest state a new player sees, so it is treated as a prompt.
 */
export default function RoomPanel({ className = '', centered = false, inviteFriend }: RoomPanelProps) {
    const room = useMinesweeperStore((state) => state.room);
    const mode = useMinesweeperStore((state) => state.mode);
    const playerStatsInRoom = useMinesweeperStore((state) => state.playerStatsInRoom);

    // Co-op only: PVP's own waiting copy and gated Start button say this already.
    const isAlone = mode === 'co-op' && playerStatsInRoom.length <= 1;

    /* Signed-in only, since a friend list needs an account; the link stays the primary way in. */
    const { status } = useSession();
    const canInvite = status === 'authenticated' && !!inviteFriend;

    const [linkCopied, setLinkCopied] = React.useState(false);
    const [manualLink, setManualLink] = React.useState<string | null>(null);
    const manualLinkRef = React.useRef<HTMLInputElement>(null);
    const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cancels the pending "reset to Copy Link" timer if the panel unmounts first.
    React.useEffect(() => () => {
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    }, []);

    React.useEffect(() => {
        setLinkCopied(false);
        setManualLink(null);
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    }, [room]);

    React.useEffect(() => {
        if (!manualLink) return;
        manualLinkRef.current?.focus();
        manualLinkRef.current?.select();
    }, [manualLink]);

    const copyRoomLink = React.useCallback(async () => {
        try {
            await navigator.clipboard.writeText(buildJoinUrl(room));
            setLinkCopied(true);
            setManualLink(null);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
        } catch {
            setLinkCopied(false);
            setManualLink(buildJoinUrl(room));
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
            {/* aria-live on a button is unreliable, and its aria-label never changes anyway. */}
            <span className="sr-only" aria-live="polite">
                {linkCopied ? 'Link copied to clipboard' : ''}
            </span>

            {manualLink && (
                <div className="mt-3">
                    <p className="text-pixel-2xs text-ink-muted mb-2" role="status">
                        Copy didn&apos;t work. You can copy the link below.
                    </p>
                    <Field label="Room invite link">
                        <Input
                            ref={manualLinkRef}
                            size="sm"
                            value={manualLink}
                            readOnly
                            aria-label="Room invite link"
                            onFocus={(event) => event.currentTarget.select()}
                            onClick={(event) => event.currentTarget.select()}
                        />
                    </Field>
                </div>
            )}

            {/* The BUTTON only: this panel is mounted twice, so the dialog lives in Grid, mounted once. */}
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
