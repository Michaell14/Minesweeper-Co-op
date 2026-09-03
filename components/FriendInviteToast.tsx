'use client'
import React from 'react';
import { NameWithAvatar, Panel, Button } from '@/components/ds';
import { useMinesweeperStore } from '@/app/store';
import { ROOM_QUERY_PARAM } from '@/lib/roomLink';

/**
 * "Come play with me", from a friend. Mounted once in the layout beside
 * AchievementToast, for the same reason: the socket lives on `/` and `/daily`,
 * and an offer must survive navigation. ACCEPTING IS A NAVIGATION, not a
 * socket call: the `?room=` join flow already fills the code, asks for a name,
 * handles a full room, and leaves a current game first.
 */

/**
 * Long enough to decide, short enough that a room does not fill behind an
 * unattended offer. Longer than the achievement toast: this is a question.
 */
const DISMISS_AFTER_MS = 20_000;

export default function FriendInviteToast() {
    const invite = useMinesweeperStore((state) => state.friendInvite);
    const setFriendInvite = useMinesweeperStore((state) => state.setFriendInvite);

    /*
     * Re-armed per invite, keyed on room and sender rather than the object, so
     * a store write replacing an identical invite does not restart the clock.
     */
    const key = invite ? `${invite.fromId}:${invite.room}` : null;
    React.useEffect(() => {
        if (!key) return;
        const timer = setTimeout(() => setFriendInvite(null), DISMISS_AFTER_MS);
        return () => clearTimeout(timer);
    }, [key, setFriendInvite]);

    if (!invite) return null;

    const href = `/?${ROOM_QUERY_PARAM}=${encodeURIComponent(invite.room)}`;

    return (
        <div
            /* Above the achievement toast: both are fixed to the same corner. */
            className="fixed bottom-24 left-4 right-4 mx-auto max-w-[22rem] z-50 flex flex-col gap-2"
            role="status"
            aria-live="polite">
            <Panel title="Invite">
                <p className="text-pixel-sm m-0 flex items-center gap-2">
                    <NameWithAvatar avatar={invite.fromAvatar} size={24}>
                        {invite.fromName}
                    </NameWithAvatar>
                </p>
                <p className="text-pixel-2xs text-ink-muted mt-2 mb-0">
                    wants you in {invite.mode === 'pvp' ? 'a race' : 'a co-op game'} — room {invite.room}
                </p>
                <div className="flex gap-2 mt-3">
                    {/* A link, not a button: the same door a shared link opens. */}
                    <a
                        href={href}
                        className="no-underline"
                        onClick={() => setFriendInvite(null)}
                        aria-label={`Join ${invite.fromName} in room ${invite.room}`}>
                        <Button intent="primary" size="sm">Join</Button>
                    </a>
                    <Button
                        size="sm"
                        onClick={() => setFriendInvite(null)}
                        aria-label={`Dismiss ${invite.fromName}'s invite`}>
                        Not now
                    </Button>
                </div>
            </Panel>
        </div>
    );
}
