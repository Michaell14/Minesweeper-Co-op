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
    board: Cell[][];        // 2D array representing the game board
    gameOver: boolean;      // True when someone hits a mine
    gameWon: boolean;       // True when all non-mine cells are revealed

    /*
     * Server timestamps, not an elapsed count. The client ticks locally from
     * startedAt, so co-op players read the same time without a per-second event
     * and someone arriving mid-run joins the clock already running rather than
     * starting a new one. null means the clock has not started / has not
     * stopped.
     */
    startedAt: number | null;
    endedAt: number | null;

    /*
     * Set once, when a board is CLEARED — not on a loss, and not on a win by
     * an opponent's disconnect. null means this run did not finish a board, so
     * the summary has no record to talk about.
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
    board: [],              // Empty board until a room is joined
    gameOver: false,
    gameWon: false,
    startedAt: null,
    endedAt: null,
    bestTimeResult: null,

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
    /* A new run has no verdict yet, so starting or clearing the clock drops it. */
    setClock: ({ startedAt, endedAt }) =>
        set(endedAt === null ? { startedAt, endedAt, bestTimeResult: null } : { startedAt, endedAt }),

    setBestTimeResult: (bestTimeResult) => set({ bestTimeResult }),
});
