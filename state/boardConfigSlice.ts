import { StateCreator } from 'zustand';
import { DEFAULT_DIFFICULTY, DEFAULT_PRESET } from '@/shared/boardConfig';
import type { MinesweeperState } from './store';

/**
 * Board dimensions, difficulty label and game mode.
 *
 * Defaults come from shared/boardConfig, which the server validates against too.
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
    numRows: DEFAULT_PRESET.rows,
    numCols: DEFAULT_PRESET.cols,
    numMines: DEFAULT_PRESET.mines,
    difficulty: DEFAULT_DIFFICULTY,
    mode: 'co-op',

    setDimensions: (rows, cols, mines) => set({ numRows: rows, numCols: cols, numMines: mines }),
    setDifficulty: (diff) => set({ difficulty: diff }),
    setMode: (mode) => set({ mode }),
});
