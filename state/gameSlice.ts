import { StateCreator } from 'zustand';
import type { Cell } from './types';
import type { MinesweeperState } from './store';

/** The board, its win/loss flags, and the run clock. */
export interface GameSlice {
    board: Cell[][];        // 2D array representing the game board
    gameOver: boolean;      // True when someone hits a mine
    gameWon: boolean;       // True when all non-mine cells are revealed

    /*
     * Server timestamps, not an elapsed count. The client ticks locally from
     * startedAt, so co-op players read the same time without a per-second event
     * and a refresh resumes the run instead of restarting it. null means the
     * clock has not started / has not stopped.
     */
    startedAt: number | null;
    endedAt: number | null;

    setBoard: (newBoard: Cell[][]) => void;
    setCell: (row: number, col: number, newCell: Cell) => void;
    setGameOver: (isGameOver: boolean) => void;
    setGameWon: (isGameWon: boolean) => void;
    setClock: (clock: { startedAt: number | null; endedAt: number | null }) => void;
}

export const createGameSlice: StateCreator<MinesweeperState, [], [], GameSlice> = (set) => ({
    board: [],              // Empty board until a room is joined
    gameOver: false,
    gameWon: false,
    startedAt: null,
    endedAt: null,

    setBoard: (newBoard) => set({ board: newBoard }),

    /** Replaces one cell. Cheaper than resending the whole board for a single change. */
    setCell: (row, col, newCell) =>
        set((state) => ({
            board: state.board.map((r, rowIndex) =>
                r.map((c, colIndex) => (rowIndex === row && colIndex === col ? newCell : c))
            ),
        })),

    setGameOver: (isGameOver) => set({ gameOver: isGameOver }),
    setGameWon: (isGameWon) => set({ gameWon: isGameWon }),
    setClock: ({ startedAt, endedAt }) => set({ startedAt, endedAt }),
});
