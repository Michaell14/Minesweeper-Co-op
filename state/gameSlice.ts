import { StateCreator } from 'zustand';
import type { Cell } from './types';
import type { BestTime } from '@/lib/bestTimes';
import type { MinesweeperState } from './store';

/** What the last completed clear did to this browser's record for that board. */
export interface BestTimeResult {
    improved: boolean;
    previous: BestTime | null;
}

/** The board, its win/loss flags, and the run clock. */
export interface GameSlice {
    board: Cell[][];
    gameOver: boolean;      // someone hit a mine
    gameWon: boolean;       // every non-mine cell is revealed

    /*
     * Server timestamps, not an elapsed count: the client ticks locally from
     * startedAt, so co-op players read the same time without a per-second event
     * and someone arriving mid-run joins the clock already running. null means
     * not started / not stopped.
     */
    startedAt: number | null;
    endedAt: number | null;

    /*
     * Set only when a board is CLEARED — not on a loss, and not on a win by an
     * opponent's disconnect. null means the summary has no record to show.
     */
    bestTimeResult: BestTimeResult | null;

    setBoard: (newBoard: Cell[][]) => void;
    setCell: (row: number, col: number, newCell: Cell) => void;
    setGameOver: (isGameOver: boolean) => void;
    setGameWon: (isGameWon: boolean) => void;
    setClock: (clock: { startedAt: number | null; endedAt: number | null }) => void;
    setBestTimeResult: (result: BestTimeResult | null) => void;
}

export const createGameSlice: StateCreator<MinesweeperState, [], [], GameSlice> = (set) => ({
    board: [],              // empty until a room is joined
    gameOver: false,
    gameWon: false,
    startedAt: null,
    endedAt: null,
    bestTimeResult: null,

    setBoard: (newBoard) => set({ board: newBoard }),

    /** Replaces one cell, so a single change need not resend the whole board. */
    setCell: (row, col, newCell) =>
        set((state) => ({
            board: state.board.map((r, rowIndex) =>
                r.map((c, colIndex) => (rowIndex === row && colIndex === col ? newCell : c))
            ),
        })),

    setGameOver: (isGameOver) => set({ gameOver: isGameOver }),
    setGameWon: (isGameWon) => set({ gameWon: isGameWon }),
    /* A new run has no verdict yet, so starting or clearing the clock drops it. */
    setClock: ({ startedAt, endedAt }) =>
        set(endedAt === null ? { startedAt, endedAt, bestTimeResult: null } : { startedAt, endedAt }),

    setBestTimeResult: (bestTimeResult) => set({ bestTimeResult }),
});
