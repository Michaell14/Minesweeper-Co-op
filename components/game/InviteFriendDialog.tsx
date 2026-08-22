'use client';

import React from 'react';
import { Button, Dialog, DialogClose, NameWithAvatar } from '@/components/ds';
import { useMinesweeperStore } from '@/app/store';
import { DIALOGS } from '@/lib/dialogs';
import { fetchFriends, type FriendProfile } from '@/lib/friendsApi';

export interface InviteFriendDialogProps {
    inviteFriend: (friendId: string) => void;
}

/**
 * Pick a friend to pull into this room.
 *
 * Only ONLINE friends are offered. An invite to somebody who is not here is a
 * message with nowhere to go — the server drops it, and a button that silently
 * does nothing is worse than a list that is honest about being empty.
 *
 * The list is fetched when the dialog is opened rather than held by the room:
 * a roster is not game state, and mounting it into the board's render path
 * would put a REST call behind every game.
 */
export default function InviteFriendDialog({ inviteFriend }: InviteFriendDialogProps) {
    const onlineFriendIds = useMinesweeperStore((state) => state.onlineFriendIds);
    const [friends, setFriends] = React.useState<FriendProfile[] | null>(null);
    const [invited, setInvited] = React.useState<string[]>([]);

    // One fetch, the first time the dialog is opened. Presence arrives on the
    // socket afterwards, so the list stays current without re-fetching.
    const opened = React.useRef(false);
    React.useEffect(() => {
        const dialog = document.getElementById(DIALOGS.inviteFriend);
        if (!dialog) return;
        const onToggle = async () => {
            if (!(dialog as HTMLDialogElement).open || opened.current) return;
            opened.current = true;
            const graph = await fetchFriends();
            setFriends(graph ? graph.friends : []);
        };
        // `toggle` rather than a store flag: these dialogs are opened
        // imperatively with showModal(), so the element is the only thing that
        // knows it happened.
        dialog.addEventListener('toggle', onToggle);
        return () => dialog.removeEventListener('toggle', onToggle);
    }, []);

    const online = (friends ?? []).filter((friend) => onlineFriendIds.includes(friend.id));

    const send = (friend: FriendProfile) => {
        inviteFriend(friend.id);
        // The server answers nothing on success — every refusal is a silent
        // drop, deliberately — so this is the only feedback there is. It says
        // "sent", not "delivered", which is exactly what the client knows.
        setInvited((sent) => [...sent, friend.id]);
    };

    return (
        <Dialog
            id={DIALOGS.inviteFriend}
            title="Invite a friend"
            actions={<DialogClose aria-label="Close invite dialog">Close</DialogClose>}>
            {friends === null && <p className="text-pixel-sm text-ink-muted">Loading…</p>}

            {friends !== null && online.length === 0 && (
                <p className="text-pixel-sm text-ink-muted">
                    None of your friends are online right now.
                </p>
            )}

            {online.length > 0 && (
                <ul className="list-none p-0 m-0 flex flex-col gap-2">
                    {online.map((friend) => (
                        <li key={friend.id} className="flex items-center justify-between gap-3">
                            <NameWithAvatar avatar={friend.avatar}>{friend.displayName}</NameWithAvatar>
                            <Button
                                size="sm"
                                intent="primary"
                                disabled={invited.includes(friend.id)}
                                onClick={() => send(friend)}
                                aria-label={`Invite ${friend.displayName} to this room`}>
                                {invited.includes(friend.id) ? 'Sent' : 'Invite'}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </Dialog>
    );
}
