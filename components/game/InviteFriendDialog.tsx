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
    const [failed, setFailed] = React.useState(false);
    const [invited, setInvited] = React.useState<string[]>([]);

    // One fetch, the first time the dialog is opened. Presence arrives on the
    // socket afterwards, so the list stays current without re-fetching.
    //
    // Two refs, not one: "we have the roster" and "a request is in flight" are
    // different reasons not to start another, and only the first should
    // survive a failure. Refs rather than the state above because the listener
    // below is registered once and would close over the first render's values.
    const loaded = React.useRef(false);
    const inFlight = React.useRef(false);
    /*
     * An open that landed while a request was in flight. It cannot start a
     * second one, but it is still a request for fresh data — so if the flight
     * FAILS, it is honoured then. Without it that open edge is spent, and the
     * dialog the player is looking at sits on the error until they close and
     * open it a second time. Cleared at the start of every attempt, so a
     * failing endpoint retries once per reopen rather than in a loop.
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
            // A fetch that failed is not a graph with nobody in it. Leave it
            // unloaded so the next open tries again, rather than answering "no
            // friends online" for the rest of the session over one blip.
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
