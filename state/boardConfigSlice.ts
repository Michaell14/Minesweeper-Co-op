import { StateCreator } from 'zustand';
import { DEFAULT_DIFFICULTY, DEFAULT_SIZE, DEFAULT_PRESET, mineCountFor, sizePreset } from '@/shared/boardConfig';
import type { MinesweeperState } from './store';
import type { GameMode } from '@/shared/socketPayloads';

/**
 * Board dimensions, size and difficulty labels, and game mode. Defaults come
 * from shared/boardConfig, which the server validates against too.
 *
 * `boardSize` and `difficulty` are LABELS for the landing page's two selectors;
 * only `numRows`/`numCols`/`numMines` are ever emitted. `setBoardConfig` is the
 * ONE place that derives the numbers from the pair, so for a user-driven pick
 * they can never disagree with the labels on screen.
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
     * Custom), mines derived from the difficulty's density.
     *
     * `dims` is for the Custom size, whose dimensions come from a dialog rather
     * than a preset. Omitting it keeps whatever is already set, which is what
     * changing difficulty on a custom board should do.
     */
    setBoardConfig: (sizeTitle: string, difficultyTitle: string, dims?: { rows: number, cols: number }) => void;

    /**
     * Raw dimension override with no size/difficulty label attached.
     * `joinRoomSuccess` is the one caller — the server sends only numbers.
     * `boardSize`/`difficulty` are left stale, so anything wanting a label after
     * a join must derive its own rather than read those fields.
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
