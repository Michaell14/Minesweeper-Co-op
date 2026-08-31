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
    /**
     * Signed-in players in the current room, refreshed by the server after
     * every add. Server-filtered: it never contains you, a guest, or anybody
     * either of you has blocked.
     */
    roomFriends: RoomFriend[];
    /**
     * The counter sent with every ask for that list, and the one belonging to
     * the newest list actually taken.
     *
     * The server answers when its Redis and Postgres work finishes rather than
     * in the order it was asked, so a list from before an add can arrive after
     * the one that reflects it — putting "Add friend" back under somebody just
     * added. Comparing tokens is what tells the two apart; the room alone
     * cannot, because both are about the same room.
     *
     * `roomFriendsToken` is monotonic for the life of the tab; `seen` only
     * ever moves forward, and `resetRoomFriends` jumps it to the token to
     * retire what the visit being left is still owed.
     */
    roomFriendsToken: number;
    roomFriendsSeen: number;
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

    // The snapshot is the truth as the server sees it right now; a client that
    // just connected has nothing worth merging into it.
    setOnlineFriends: (ids) => set({ onlineFriendIds: [...new Set(ids)] }),

    // Replaced wholesale: the server re-sends the list after every add, so
    // there is never a local edit to preserve. The token comes with it so the
    // next arrival can tell whether it is newer than this one.
    setRoomFriends: (roomFriends, roomFriendsSeen) => set({ roomFriends, roomFriendsSeen }),

    /*
     * The list goes, and so does every ask still owed an answer: `seen`
     * catches up to the last token handed out, which is the highest any reply
     * from this visit can carry. The counter itself keeps counting.
     *
     * Rejoining the same room would otherwise let one through — same room,
     * and a token nothing has seen yet — offering the last visit's players in
     * this one.
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
