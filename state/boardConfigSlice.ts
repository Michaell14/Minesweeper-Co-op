import { StateCreator } from 'zustand';
import type { MinesweeperState } from './store';

/**
 * Board dimensions, difficulty label and game mode.
 *
 * The 16/16/40 defaults are Medium. They are also hardcoded in
 * hooks/useGameActions (leaveRoom) and components/Landing (cancelCustom) —
 * see ARCHITECTURE.md §8.
 */
export interface BoardConfigSlice {
    numRows: number;
    numCols: number;
    numMines: number;
    difficulty: string;     // "Easy" | "Medium" | "Hard" | "Custom"
    mode: string;           // "co-op" | "pvp"

    setDimensions: (rows: number, cols: number, mines: number) => void;
    setDifficulty: (diff: string) => void;
    setMode: (mode: string) => void;
}

export const createBoardConfigSlice: StateCreator<MinesweeperState, [], [], BoardConfigSlice> = (set) => ({
    numRows: 16,
    numCols: 16,
    numMines: 40,
    difficulty: 'Medium',
    mode: 'co-op',

    setDimensions: (rows, cols, mines) => set({ numRows: rows, numCols: cols, numMines: mines }),
    setDifficulty: (diff) => set({ difficulty: diff }),
    setMode: (mode) => set({ mode }),
});
