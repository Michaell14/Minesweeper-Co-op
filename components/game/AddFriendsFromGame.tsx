'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { useMinesweeperStore } from '@/app/store';
import { Button, NameWithAvatar } from '@/components/ds';

export interface AddFriendsFromGameProps {
    addRoomFriend: (playerId: string) => void;
}

/**
 * "Add the people you just played with", at the bottom of the game summary:
 * the moment a quick-match stranger has a reason to become a friend. The list
 * is entirely the server's (no you, guests, blocks or departed sockets), so an
 * empty list renders nothing rather than an empty heading.
 */
export default function AddFriendsFromGame({ addRoomFriend }: AddFriendsFromGameProps) {
    const { status } = useSession();
    const roomFriends = useMinesweeperStore((state) => state.roomFriends);

    /*
     * Draws only. The list is requested where the summary opens
     * (hooks/useGameEvents.ts); fetching here asked four times on room join.
     */
    if (status !== 'authenticated' || roomFriends.length === 0) return null;

    /** What the button says, and whether it still does anything. */
    const action = (statusOf: (typeof roomFriends)[number]['status']) => {
        if (statusOf === 'friends') return { label: 'Friends', done: true };
        if (statusOf === 'requested') return { label: 'Requested', done: true };
        // They asked first, so this press is an acceptance (`requestFriend` folds the two).
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
