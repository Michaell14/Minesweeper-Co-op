import { StateCreator } from 'zustand';
import type { Cell } from './types';
import type { BestTime } from '@/lib/bestTimes';
import type { CascadeOrigin } from '@/lib/motion';
import type { MinesweeperState } from './store';

/** A cell plus where it goes — structurally the server's `CellUpdate`. */
export type CellPlacement = Cell & { row: number; col: number };

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
     * Server timestamps, not an elapsed count: clients tick locally from
     * startedAt, so co-op reads one clock without a per-second event. null
     * means not started / not stopped.
     */
    startedAt: number | null;
    endedAt: number | null;

    /* Set only when a board is CLEARED, never on a loss or an opponent's disconnect. */
    bestTimeResult: BestTimeResult | null;

    /*
     * Where the last batch of reveals started; read only by the cascade
     * animation. Board-level because nothing cosmetic belongs in a `Cell`.
     */
    cascadeOrigin: CascadeOrigin;

    setBoard: (newBoard: Cell[][]) => void;
    setCells: (updates: CellPlacement[]) => void;
    toggleCellFlag: (row: number, col: number) => void;
    setCascadeOrigin: (origin: CascadeOrigin) => void;
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
    cascadeOrigin: null,

    setBoard: (newBoard) => set({ board: newBoard }),

    /*
     * NOT cleared by setBoard: the first click arrives as a whole board and is
     * the largest cascade anyone sees. Left standing it means "the last cell
     * anyone acted on", a fair anchor for the game-over reveal too; only a
     * board restored on a fresh load has none.
     */
    setCascadeOrigin: (cascadeOrigin) => set({ cascadeOrigin }),

    /**
     * Applies a batch of changed cells. ONE `set` and only the touched rows
     * copied: per-cell it was a full board rebuild and a notification each,
     * which was the cascade stutter, growing with the square of the board.
     * Fields are picked rather than spread because `CellPlacement` carries row
     * and col, and a board cell is only ever `{ isMine, isOpen, isFlagged, nearbyMines }`.
     */
    setCells: (updates) =>
        set((state) => {
            if (updates.length === 0) return {};
            const board = [...state.board];
            const copied = new Set<number>();
            for (const { row, col, isMine, isOpen, isFlagged, nearbyMines } of updates) {
                if (!board[row] || !board[row][col]) continue;
                if (!copied.has(row)) {
                    board[row] = [...board[row]];
                    copied.add(row);
                }
                board[row][col] = { isMine, isOpen, isFlagged, nearbyMines };
            }
            // Every coordinate was off-board; a fresh reference over identical content would notify for nothing.
            if (copied.size === 0) return {};
            return { board };
        }),

    /**
     * Flips a flag locally without waiting for the server. The refusal
     * predicate is re-checked HERE, since a teammate's reveal can land after
     * the caller's read. Safe to guess because every refusal the caller cannot
     * see arrives WITH the event that causes it, which rewrites the cell.
     */
    toggleCellFlag: (row, col) =>
        set((state) => {
            const cell = state.board[row]?.[col];
            if (!cell || cell.isOpen) return {};
            const board = [...state.board];
            board[row] = [...board[row]];
            board[row][col] = { ...cell, isFlagged: !cell.isFlagged };
            return { board };
        }),

    setGameOver: (isGameOver) => set({ gameOver: isGameOver }),
    setGameWon: (isGameWon) => set({ gameWon: isGameWon }),
    /* A new run has no verdict yet, so starting or clearing the clock drops it. */
    setClock: ({ startedAt, endedAt }) =>
        set(endedAt === null ? { startedAt, endedAt, bestTimeResult: null } : { startedAt, endedAt }),

    setBestTimeResult: (bestTimeResult) => set({ bestTimeResult }),
});
