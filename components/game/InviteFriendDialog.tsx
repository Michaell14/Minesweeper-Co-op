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
 * Pick a friend to pull into this room. Only ONLINE friends are offered: the
 * server drops an invite to somebody absent, and an honest empty list beats a
 * button that does nothing. Fetched when opened rather than held by the room,
 * so no REST call sits in the board's render path.
 */
export default function InviteFriendDialog({ inviteFriend }: InviteFriendDialogProps) {
    const onlineFriendIds = useMinesweeperStore((state) => state.onlineFriendIds);
    const [friends, setFriends] = React.useState<FriendProfile[] | null>(null);
    const [failed, setFailed] = React.useState(false);
    const [invited, setInvited] = React.useState<string[]>([]);

    // One fetch, the first time the dialog opens; presence arrives on the
    // socket afterwards. Two refs: "we have the roster" and "a request is in
    // flight" are different reasons not to start another, and only the first
    // survives a failure. Refs because the listener is registered once.
    const loaded = React.useRef(false);
    const inFlight = React.useRef(false);
    /*
     * An open that landed mid-flight: it cannot start a second request, but
     * if the flight FAILS it is honoured then, so the player is not left on
     * the error until they reopen. Cleared per attempt, so a failing endpoint
     * retries once per reopen rather than in a loop.
     */
    const reopened = React.useRef(false);
    React.useEffect(() => {
        const dialog = document.getElementById(DIALOGS.inviteFriend);
        if (!dialog) return;
        const load = async (): Promise<void> => {
            inFlight.current = true;
            reopened.current = false;
            setFailed(false);
            const graph = await fetchFriends();
            inFlight.current = false;
            // A failed fetch is not an empty graph: leave it unloaded so the
            // next open tries again.
            if (!graph) {
                if (reopened.current && (dialog as HTMLDialogElement).open) return load();
                setFailed(true);
                return;
            }
            loaded.current = true;
            setFriends(graph.friends);
        };
        const onToggle = () => {
            if (!(dialog as HTMLDialogElement).open || loaded.current) return;
            if (inFlight.current) {
                reopened.current = true;
                return;
            }
            void load();
        };
        // `toggle` rather than a store flag: showModal() is imperative, so the
        // element is the only thing that knows it opened.
        dialog.addEventListener('toggle', onToggle);
        return () => dialog.removeEventListener('toggle', onToggle);
    }, []);

    const online = (friends ?? []).filter((friend) => onlineFriendIds.includes(friend.id));

    const send = (friend: FriendProfile) => {
        inviteFriend(friend.id);
        // The server answers nothing on success (every refusal is a silent
        // drop), so this is the only feedback: "sent", not "delivered".
        setInvited((sent) => [...sent, friend.id]);
    };

    return (
        <Dialog
            id={DIALOGS.inviteFriend}
            title="Invite a friend"
            actions={<DialogClose aria-label="Close invite dialog">Close</DialogClose>}>
            {friends === null && !failed && <p className="text-pixel-sm text-ink-muted">Loading…</p>}

            {failed && (
                <p className="text-pixel-sm text-ink-muted">
                    Could not load your friends. Close this and open it again to retry.
                </p>
            )}

            {!failed && friends !== null && online.length === 0 && (
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
