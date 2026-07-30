import { StateCreator } from 'zustand';
import type { MinesweeperState } from './store';

export type PvpOpponentStatus = 'waiting' | 'playing' | 'won' | 'failed' | 'disconnected';

/** Everything that only applies to a 1v1 race. */
export interface PvpSlice {
    pvpStarted: boolean;
    pvpOpponentName: string;
    pvpOpponentStatus: PvpOpponentStatus;
    pvpWinner: string | null;
    pvpRoomReady: boolean;              // True once two players are present
    pvpIsHost: boolean;
    pvpOpponentProgress: number;        // Opponent's revealed safe cells
    pvpTotalSafeCells: number;

    setPvpStarted: (started: boolean) => void;
    setPvpOpponentName: (name: string) => void;
    setPvpOpponentStatus: (status: PvpOpponentStatus) => void;
    setPvpWinner: (winner: string | null) => void;
    setPvpRoomReady: (ready: boolean) => void;
    setPvpIsHost: (isHost: boolean) => void;
    setPvpOpponentProgress: (progress: number) => void;
    setPvpTotalSafeCells: (total: number) => void;
    resetPvpState: () => void;
}

const initialPvpState = {
    pvpStarted: false,
    pvpOpponentName: '',
    pvpOpponentStatus: 'waiting' as PvpOpponentStatus,
    pvpWinner: null,
    pvpRoomReady: false,
    pvpIsHost: false,
    pvpOpponentProgress: 0,
    pvpTotalSafeCells: 0,
};

export const createPvpSlice: StateCreator<MinesweeperState, [], [], PvpSlice> = (set) => ({
    ...initialPvpState,

    setPvpStarted: (started) => set({ pvpStarted: started }),
    setPvpOpponentName: (name) => set({ pvpOpponentName: name }),
    setPvpOpponentStatus: (status) => set({ pvpOpponentStatus: status }),
    setPvpWinner: (winner) => set({ pvpWinner: winner }),
    setPvpRoomReady: (ready) => set({ pvpRoomReady: ready }),
    setPvpIsHost: (isHost) => set({ pvpIsHost: isHost }),
    setPvpOpponentProgress: (progress) => set({ pvpOpponentProgress: progress }),
    setPvpTotalSafeCells: (total) => set({ pvpTotalSafeCells: total }),

    /**
     * Used when leaving a room and on rematch. Deliberately also clears
     * gameOver/gameWon from the game slice — a rematch has to reset those too.
     */
    resetPvpState: () => set({ ...initialPvpState, gameOver: false, gameWon: false }),
});
