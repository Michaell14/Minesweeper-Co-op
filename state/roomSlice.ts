import { StateCreator } from 'zustand';
import type { PlayerHover, PlayerStats } from './types';
import type { MinesweeperState } from './store';

/** Who is in the room, their scores, and where their cursors are. */
export interface RoomSlice {
    room: string;
    playerJoined: boolean;                      // true once this player is in a room
    name: string;                               // this player's display name
    playerStatsInRoom: PlayerStats[];           // everyone's scores
    gameOverName: string;                       // who hit the mine
    playerHovers: Record<string, PlayerHover>;  // live hover state, by socket id
    /** In the quick-match queue: waiting to be paired, not yet in a room.
     *  Lives here rather than in its own slice because the only thing it
     *  produces is a room, and it ends the moment `playerJoined` begins. */
    matchSearching: boolean;
    /** Connected players other than you, as of the last `matchSearching`. */
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
    updatePlayerHover: (id: string, row: number, col: number, name: string, color: string) => void;
    removePlayerHover: (id: string) => void;
    clearAllHovers: () => void;
}

export const createRoomSlice: StateCreator<MinesweeperState, [], [], RoomSlice> = (set) => ({
    room: '',
    playerJoined: false,
    name: '',
    playerStatsInRoom: [],
    gameOverName: '',
    playerHovers: {},
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
});
