'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { Button, NameWithAvatar } from '@/components/ds';

export interface AddFriendsFromGameProps {
    addRoomFriend: (playerId: string) => void;
}

/**
 * "Add the people you just played with", at the bottom of the game summary.
 *
 * This is the whole reason the friend graph gets used. A friend code is a fine
 * way to add somebody you already know; it is a terrible way to meet the
 * stranger a quick match just paired you with, which is precisely the moment
 * two people have a reason to become friends.
 *
 * The list is entirely the SERVER's: it excludes you, guests, anyone either of
 * you has blocked, and anyone who has already closed their tab. So there is no
 * filtering here — an empty list means there is nobody to offer, and this
 * renders nothing rather than an empty heading.
 */
export default function AddFriendsFromGame({ addRoomFriend }: AddFriendsFromGameProps) {
    const { status } = useSession();
    const roomFriends = useMinesweeperStore((state) => state.roomFriends);

    /*
     * Draws only. The list is asked for where the summary is OPENED
     * (hooks/useGameEvents.ts): this component is mounted once per summary
     * dialog, and dialogs here are always rendered, so owning the fetch meant
     * asking four times on room join.
     */
    if (status !== 'authenticated' || roomFriends.length === 0) return null;

    /** What the button says, and whether it still does anything. */
    const action = (statusOf: (typeof roomFriends)[number]['status']) => {
        if (statusOf === 'friends') return { label: 'Friends', done: true };
        if (statusOf === 'requested') return { label: 'Requested', done: true };
        // They asked first, so this press is an acceptance — `requestFriend`
        // folds the two together, and saying "Accept" is the honest word for it.
        if (statusOf === 'incoming') return { label: 'Accept', done: false };
        return { label: 'Add friend', done: false };
    };

    return (
        <section aria-label="Players you can add as friends" className="mt-2">
            <p className="text-pixel-sm m-0 mb-2">Played with</p>
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
                {roomFriends.map((player) => {
                    const { label, done } = action(player.status);
                    return (
                        <li key={player.id} className="flex items-center justify-between gap-3">
                            <NameWithAvatar avatar={player.avatar}>{player.name}</NameWithAvatar>
                            <Button
                                size="sm"
                                intent={done ? 'default' : 'primary'}
                                disabled={done}
                                onClick={() => addRoomFriend(player.id)}
                                aria-label={`${label}: ${player.name}`}>
                                {label}
                            </Button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
