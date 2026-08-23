'use client'
import React from 'react';
import { NameWithAvatar, Panel, Button } from '@/components/ds';
import { useMinesweeperStore } from '@/app/store';
import { ROOM_QUERY_PARAM } from '@/lib/roomLink';

/**
 * "Come play with me", from a friend, wherever the player happens to be.
 *
 * Mounted once in the layout beside AchievementToast and for the same reason:
 * the socket lives on `/` and `/daily`, and an offer that arrives a moment
 * before the player navigates away would unmount with the page. Nothing
 * arrives WHILE they are on /settings — presence is a live socket, so an
 * account reading it is offline and never gets invited in the first place.
 *
 * ACCEPTING IS A NAVIGATION, not a socket call. The join flow already exists
 * for links (`?room=`) — it fills the code, asks for a name if there is not
 * one, and handles a room that filled up in the meantime. Emitting a join from
 * here would be a second implementation of all of that, and a worse one: this
 * player may be mid-game somewhere else, and leaving that room is the first
 * thing joining another has to do.
 */

/**
 * Long enough to notice and decide, short enough that a room does not fill
 * behind an offer nobody is looking at. Deliberately longer than the
 * achievement toast: that one is news, this one is a question.
 */
const DISMISS_AFTER_MS = 20_000;

export default function FriendInviteToast() {
    const invite = useMinesweeperStore((state) => state.friendInvite);
    const setFriendInvite = useMinesweeperStore((state) => state.setFriendInvite);

    /*
     * Re-armed per invite, keyed on the room and sender rather than on the
     * object: a store write that replaces an identical invite must not restart
     * the clock on an offer already half expired.
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
            /* Above the achievement toast rather than beside it: both are fixed
               to the same corner, and two boxes fighting for it is worse than
               one sitting on top of the other. */
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
                    {/* A link, not a button: the join flow is a page load away
                        and this is the same door a shared link opens. */}
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
