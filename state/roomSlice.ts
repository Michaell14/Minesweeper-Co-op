import { StateCreator } from 'zustand';
import type { PlayerHover, PlayerStats } from './types';
import type { MinesweeperState } from './store';

/** Who is in the room, their scores, and where their cursors are. */
export interface RoomSlice {
    room: string;                               // Current room code
    playerJoined: boolean;                      // True once this player is in a room
    name: string;                               // This player's display name
    playerStatsInRoom: PlayerStats[];           // Everyone's scores
    gameOverName: string;                       // Who hit the mine
    playerHovers: Record<string, PlayerHover>;  // Live hover state, by socket id

    setRoom: (newRoom: string) => void;
    setPlayerJoined: (isPlayerJoined: boolean) => void;
    setName: (newName: string) => void;
    setPlayerStatsInRoom: (newStats: PlayerStats[]) => void;
    setGameOverName: (gameOverName: string) => void;
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

    setRoom: (newRoom) => set({ room: newRoom }),
    setPlayerJoined: (isPlayerJoined) => set({ playerJoined: isPlayerJoined }),
    setName: (newName) => set({ name: newName }),
    setPlayerStatsInRoom: (newStats) => set({ playerStatsInRoom: newStats }),
    setGameOverName: (gameOverName) => set({ gameOverName }),

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
