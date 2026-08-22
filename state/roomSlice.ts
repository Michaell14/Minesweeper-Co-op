import { StateCreator } from 'zustand';
import type { PlayerEmote, PlayerHover, PlayerPing, PlayerStats } from './types';
import type { MinesweeperState } from './store';

/** Who is in the room, their scores, and where their cursors are. */
export interface RoomSlice {
    room: string;
    playerJoined: boolean;                      // true once this player is in a room
    name: string;                               // this player's display name
    playerStatsInRoom: PlayerStats[];           // everyone's scores
    gameOverName: string;                       // who hit the mine
    playerHovers: Record<string, PlayerHover>;  // live hover state, by socket id
    /** Reactions still on screen, oldest first. Bounded — see `pushPlayerEmote`. */
    playerEmotes: PlayerEmote[];
    /** Cells being pointed at, oldest first. Bounded the same way. */
    playerPings: PlayerPing[];
    /** In the quick-match queue: waiting to be paired, not yet in a room.
     *  Lives here rather than in its own slice because the only thing it
     *  produces is a room, and it ends the moment `playerJoined` begins. */
    matchSearching: boolean;
    /** Connected players other than you — everyone on the site, not everyone
     *  queued. Kept current while the search runs by `matchOnlineCount`. */
    matchOthersOnline: number;
    /**
     * The time this run is racing, in ms, or null when it is not a practice
     * race. Non-null is what makes the room a practice race — the SERVER has no
     * such concept, it just built a co-op room of one.
     */
    practiceTargetMs: number | null;
    /** Whether `practiceTargetMs` is the player's own record or the fixed par. */
    practiceTargetIsPersonal: boolean;

    setRoom: (newRoom: string) => void;
    setPlayerJoined: (isPlayerJoined: boolean) => void;
    setName: (newName: string) => void;
    setPlayerStatsInRoom: (newStats: PlayerStats[]) => void;
    setGameOverName: (gameOverName: string) => void;
    setMatchSearching: (searching: boolean) => void;
    setMatchOthersOnline: (others: number) => void;
    setPracticeTarget: (target: { ms: number; isPersonal: boolean } | null) => void;
    pushPlayerEmote: (emote: PlayerEmote) => void;
    pushPlayerPing: (ping: PlayerPing) => void;
    /** Drops everything whose deadline has passed. Idempotent. */
    expirePlayerEmotes: (now: number) => void;
    expirePlayerPings: (now: number) => void;
    updatePlayerHover: (id: string, row: number, col: number, name: string, color: string) => void;
    removePlayerHover: (id: string) => void;
    clearAllHovers: () => void;
    /** Separate from the hover clear: a board reset leaves reactions alone
     *  (they are about the moment, not the board), leaving the room does not. */
    clearPlayerEmotes: () => void;
    clearPlayerPings: () => void;
}

export const createRoomSlice: StateCreator<MinesweeperState, [], [], RoomSlice> = (set) => ({
    room: '',
    playerJoined: false,
    name: '',
    playerStatsInRoom: [],
    gameOverName: '',
    playerHovers: {},
    playerEmotes: [],
    playerPings: [],
    matchSearching: false,
    matchOthersOnline: 0,
    practiceTargetMs: null,
    practiceTargetIsPersonal: false,

    setRoom: (newRoom) => set({ room: newRoom }),
    setPlayerJoined: (isPlayerJoined) => set({ playerJoined: isPlayerJoined }),
    setName: (newName) => set({ name: newName }),
    setPlayerStatsInRoom: (newStats) => set({ playerStatsInRoom: newStats }),
    setGameOverName: (gameOverName) => set({ gameOverName }),
    setMatchSearching: (searching) => set({ matchSearching: searching }),
    setMatchOthersOnline: (others) => set({ matchOthersOnline: others }),

    setPracticeTarget: (target) =>
        set({
            practiceTargetMs: target?.ms ?? null,
            practiceTargetIsPersonal: target?.isPersonal ?? false,
        }),

    /*
     * Capped at three. A full room can emote faster than anyone reads, and an
     * unbounded feed is both a wall of glyphs and a way for one player to push
     * the rest off screen — the cap is the display half of the server's bucket.
     */
    pushPlayerEmote: (emote) =>
        set((state) => ({ playerEmotes: [...state.playerEmotes, emote].slice(-3) })),

    /*
     * Three, like the reactions, and for the same reason — but pings land ON
     * the board, so an unbounded list is also a way to paper the grid with
     * rings nobody can see through.
     */
    pushPlayerPing: (ping) =>
        set((state) => ({ playerPings: [...state.playerPings, ping].slice(-3) })),

    expirePlayerEmotes: (now) =>
        set((state) => {
            const live = state.playerEmotes.filter((emote) => emote.expiresAt > now);
            // Same array when nothing expired, so a tick that changes nothing
            // does not re-render the feed.
            return live.length === state.playerEmotes.length ? {} : { playerEmotes: live };
        }),

    expirePlayerPings: (now) =>
        set((state) => {
            const live = state.playerPings.filter((ping) => ping.expiresAt > now);
            return live.length === state.playerPings.length ? {} : { playerPings: live };
        }),

    updatePlayerHover: (id, row, col, name, color) =>
        set((state) => ({
            playerHovers: { ...state.playerHovers, [id]: { row, col, name, color } },
        })),

    removePlayerHover: (id) =>
        set((state) => {
            const newHovers = { ...state.playerHovers };
            delete newHovers[id];
            return { playerHovers: newHovers };
        }),

    clearAllHovers: () => set({ playerHovers: {} }),

    clearPlayerEmotes: () => set({ playerEmotes: [] }),

    clearPlayerPings: () => set({ playerPings: [] }),
});
