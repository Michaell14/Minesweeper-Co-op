import type { StateCreator } from 'zustand';

/**
 * Friends who are on the site, and any invitation waiting to be answered.
 *
 * Presence is a SET of account ids and nothing more: names and avatars come
 * from the friends payload the panel already fetches, and a second copy here
 * would be a second thing to keep in step with a rename.
 *
 * Live-socket derived on the server (utils/presence.js), so this is a mirror
 * of something authoritative rather than a cache with its own opinions — which
 * is why a snapshot REPLACES it and a delta only nudges it.
 */
export interface FriendsSlice {
    onlineFriendIds: string[];
    /**
     * The invitation on screen, or null. ONE at a time, not a queue: an invite
     * is a decision with a room attached, and stacking three of them would ask
     * somebody to pick a game from a pile while the first one fills up.
     */
    friendInvite: {
        fromId: string;
        fromName: string;
        fromAvatar: string | null;
        room: string;
        mode: 'co-op' | 'pvp';
    } | null;

    setOnlineFriends: (ids: string[]) => void;
    setFriendOnline: (id: string, online: boolean) => void;
    setFriendInvite: (invite: FriendsSlice['friendInvite']) => void;
}

export const createFriendsSlice: StateCreator<FriendsSlice> = (set) => ({
    onlineFriendIds: [],
    friendInvite: null,

    // The snapshot is the truth as the server sees it right now; a client that
    // just connected has nothing worth merging into it.
    setOnlineFriends: (ids) => set({ onlineFriendIds: [...new Set(ids)] }),

    setFriendOnline: (id, online) =>
        set((state) => {
            const present = state.onlineFriendIds.includes(id);
            if (online === present) return {};   // no change, no re-render
            return {
                onlineFriendIds: online
                    ? [...state.onlineFriendIds, id]
                    : state.onlineFriendIds.filter((friendId) => friendId !== id),
            };
        }),

    setFriendInvite: (friendInvite) => set({ friendInvite }),
});
