import type { StateCreator } from 'zustand';

/**
 * Friends on the site, and any invitation waiting to be answered. Presence is
 * a SET of account ids; names and avatars come from the friends payload the
 * panel fetches. Derived from live sockets on the server (utils/presence.js),
 * so a snapshot REPLACES it and a delta only nudges it.
 */
/** A co-player in the room just played, as the add-friend offer sees them. */
export interface RoomFriend {
    /** SOCKET id — the account id never reaches the client. */
    id: string;
    name: string;
    avatar: string | null;
    status: 'none' | 'requested' | 'incoming' | 'friends';
}

export interface FriendsSlice {
    onlineFriendIds: string[];
    /** Signed-in players in the current room, refreshed after every add. Never you, a guest, or a block. */
    roomFriends: RoomFriend[];
    /**
     * The counter sent with every ask for that list, and the token of the
     * newest list taken. The server answers in completion order, so a list
     * from before an add can arrive after the one reflecting it. The token is
     * monotonic for the tab; `seen` only moves forward, and `resetRoomFriends`
     * jumps it to the token to retire what the visit being left is still owed.
     */
    roomFriendsToken: number;
    roomFriendsSeen: number;
    /**
     * The invitation on screen, or null. ONE at a time, not a queue: an invite
     * is a decision with a room attached.
     */
    friendInvite: {
        fromId: string;
        fromName: string;
        fromAvatar: string | null;
        room: string;
        mode: 'co-op' | 'pvp';
    } | null;

    setRoomFriends: (players: RoomFriend[], token: number) => void;
    /** The next token to ask with. Monotonic for the life of the tab. */
    nextRoomFriendsToken: () => number;
    /** Drops the offer and retires the asks it left owing. */
    resetRoomFriends: () => void;
    setOnlineFriends: (ids: string[]) => void;
    setFriendOnline: (id: string, online: boolean) => void;
    setFriendInvite: (invite: FriendsSlice['friendInvite']) => void;
}

export const createFriendsSlice: StateCreator<FriendsSlice> = (set, get) => ({
    onlineFriendIds: [],
    roomFriends: [],
    roomFriendsToken: 0,
    roomFriendsSeen: 0,
    friendInvite: null,

    // The snapshot is the truth as the server sees it now; nothing worth merging into it.
    setOnlineFriends: (ids) => set({ onlineFriendIds: [...new Set(ids)] }),

    // Replaced wholesale: the server re-sends after every add, so there is no local edit to keep.
    setRoomFriends: (roomFriends, roomFriendsSeen) => set({ roomFriends, roomFriendsSeen }),

    /*
     * The list goes, and `seen` catches up to the last token handed out, the
     * highest any reply from this visit can carry. Otherwise rejoining the
     * same room lets a stale reply through, offering the last visit's players.
     */
    resetRoomFriends: () => set({ roomFriends: [], roomFriendsSeen: get().roomFriendsToken }),

    nextRoomFriendsToken: () => {
        const roomFriendsToken = get().roomFriendsToken + 1;
        set({ roomFriendsToken });
        return roomFriendsToken;
    },

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
