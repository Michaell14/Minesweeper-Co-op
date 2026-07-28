import { StateCreator } from 'zustand';
import type { Cell } from './types';
import type { MinesweeperState } from './store';

/** The board and its win/loss flags. */
export interface GameSlice {
    board: Cell[][];        // 2D array representing the game board
    gameOver: boolean;      // True when someone hits a mine
    gameWon: boolean;       // True when all non-mine cells are revealed

    setBoard: (newBoard: Cell[][]) => void;
    setCell: (row: number, col: number, newCell: Cell) => void;
    setGameOver: (isGameOver: boolean) => void;
    setGameWon: (isGameWon: boolean) => void;
}

export const createGameSlice: StateCreator<MinesweeperState, [], [], GameSlice> = (set) => ({
    board: [],              // Empty board until a room is joined
    gameOver: false,
    gameWon: false,

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
});
