import { StateCreator } from 'zustand';
import { DEFAULT_DIFFICULTY, DEFAULT_SIZE, DEFAULT_PRESET, mineCountFor, sizePreset } from '@/shared/boardConfig';
import type { MinesweeperState } from './store';
import type { GameMode } from '@/shared/socketPayloads';

/**
 * Board dimensions, size/difficulty labels, and mode. Defaults from
 * shared/boardConfig. `boardSize` and `difficulty` are LABELS for the landing
 * page; only the numbers are emitted, and `setBoardConfig` is the ONE place
 * that derives them, so a user pick cannot disagree with its labels.
 */

export interface BoardConfigSlice {
    numRows: number;
    numCols: number;
    numMines: number;
    boardSize: string;      // "Small" | "Medium" | "Large" | "Custom"
    difficulty: string;     // "Easy" | "Medium" | "Hard" | "Extreme"
    mode: GameMode;

    /**
     * Applies a size/difficulty pick: dimensions from the size (or `dims`, for
     * Custom), mines from the difficulty's density. Omitting `dims` keeps the
     * current dimensions, as changing difficulty on a custom board should.
     */
    setBoardConfig: (sizeTitle: string, difficultyTitle: string, dims?: { rows: number, cols: number }) => void;

    /**
     * Raw dimensions with no label; `joinRoomSuccess` is the one caller.
     * `boardSize`/`difficulty` go stale, so derive a label rather than read them.
     */
    setDimensions: (rows: number, cols: number, mines: number) => void;
    setBoardSize: (size: string) => void;
    setMode: (mode: GameMode) => void;
}

export const createBoardConfigSlice: StateCreator<MinesweeperState, [], [], BoardConfigSlice> = (set) => ({
    numRows: DEFAULT_PRESET.rows,
    numCols: DEFAULT_PRESET.cols,
    numMines: DEFAULT_PRESET.mines,
    boardSize: DEFAULT_SIZE,
    difficulty: DEFAULT_DIFFICULTY,
    mode: 'co-op',

    setBoardConfig: (sizeTitle, difficultyTitle, dims) =>
        set((state) => {
            const preset = sizePreset(sizeTitle);
            const rows = preset?.rows ?? dims?.rows ?? state.numRows;
            const cols = preset?.cols ?? dims?.cols ?? state.numCols;
            return {
                numRows: rows,
                numCols: cols,
                numMines: mineCountFor(rows, cols, difficultyTitle),
                boardSize: sizeTitle,
                difficulty: difficultyTitle,
            };
        }),

    setDimensions: (rows, cols, mines) => set({ numRows: rows, numCols: cols, numMines: mines }),
    setBoardSize: (size) => set({ boardSize: size }),
    setMode: (mode) => set({ mode }),
});
