import { StateCreator } from 'zustand';
import { DEFAULT_DIFFICULTY, DEFAULT_SIZE, DEFAULT_PRESET } from '@/shared/boardConfig';
import type { MinesweeperState } from './store';
import type { GameMode } from '@/shared/socketPayloads';

/**
 * Board dimensions, size and difficulty labels, and game mode.
 *
 * Defaults come from shared/boardConfig, which the server validates against too.
 *
 * `boardSize` and `difficulty` are LABELS for the landing page's two selectors;
 * only `numRows`/`numCols`/`numMines` are ever emitted. Landing recomputes the
 * dimensions from the pair via `mineCountFor` whenever either changes, so the
 * numbers stay the derived truth and the labels are only what is ticked.
 */

export interface BoardConfigSlice {
    numRows: number;
    numCols: number;
    numMines: number;
    boardSize: string;      // "Small" | "Medium" | "Large" | "Custom"
    difficulty: string;     // "Easy" | "Medium" | "Hard" | "Extreme"
    mode: GameMode;

    setDimensions: (rows: number, cols: number, mines: number) => void;
    setBoardSize: (size: string) => void;
    setDifficulty: (diff: string) => void;
    setMode: (mode: GameMode) => void;
}

export const createBoardConfigSlice: StateCreator<MinesweeperState, [], [], BoardConfigSlice> = (set) => ({
    numRows: DEFAULT_PRESET.rows,
    numCols: DEFAULT_PRESET.cols,
    numMines: DEFAULT_PRESET.mines,
    boardSize: DEFAULT_SIZE,
    difficulty: DEFAULT_DIFFICULTY,
    mode: 'co-op',

    setDimensions: (rows, cols, mines) => set({ numRows: rows, numCols: cols, numMines: mines }),
    setBoardSize: (size) => set({ boardSize: size }),
    setDifficulty: (diff) => set({ difficulty: diff }),
    setMode: (mode) => set({ mode }),
});
