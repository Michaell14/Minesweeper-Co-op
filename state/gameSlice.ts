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

    /*
     * The cell the last batch of reveals started from — read only by the cascade
     * animation, which measures each cell's delay from it. Board-level rather
     * than per-cell because a `Cell` is `{ isMine, isOpen, isFlagged,
     * nearbyMines }` and nothing cosmetic belongs in that shape.
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
     * Deliberately NOT cleared by setBoard. The first click of a game arrives as
     * a whole board rather than a cell list — the server has only just generated
     * it — and that is the largest cascade anyone sees. Clearing here dropped it
     * back to the board diagonal for exactly that reveal.
     *
     * Left standing, the value means "the last cell anyone acted on", which is a
     * reasonable anchor for every other whole-board arrival too: the game-over
     * reveal sweeps from the cell that ended it. Only a board restored on a fresh
     * load has none, and the diagonal is the right ramp there.
     */
    setCascadeOrigin: (cascadeOrigin) => set({ cascadeOrigin }),

    /**
     * Applies a batch of changed cells, so a reveal need not resend the board.
     *
     * ONE `set` for the whole batch, and only the rows it touches are copied.
     * Per-cell it was one `set` and one full board rebuild each: a 90-cell
     * cascade on a 16x30 board rebuilt 480 cells ninety times and notified every
     * subscriber ninety times, which is roughly 5,000 selectors per notification
     * across the mounted cells. That is the cascade stutter, and it grew with the
     * square of the board.
     *
     * The four fields are picked out rather than spread: `CellPlacement` carries
     * row and col, and a board cell is only ever
     * `{ isMine, isOpen, isFlagged, nearbyMines }`.
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
            // Nothing landed — every coordinate was off-board. Returning the new
            // array anyway would be a fresh reference over identical content,
            // which notifies every `board` subscriber for no change at all.
            if (copied.size === 0) return {};
            return { board };
        }),

    /**
     * Flips a flag locally, without waiting for the server to say so.
     *
     * The predicate the server refuses on is re-checked HERE rather than trusted
     * from the caller's earlier read: `useGameActions` looks at the board before
     * emitting, and a teammate's reveal can land in between.
     *
     * Safe to guess at because every refusal the caller cannot see comes WITH the
     * event that causes it — a teammate opening this cell, or the game ending —
     * and that event rewrites the cell absolutely. There is no refusal that
     * leaves a flag standing with nothing behind it to correct it.
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
