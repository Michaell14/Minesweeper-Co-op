// store.ts
import { create } from 'zustand';

export interface Cell {
    isMine: boolean;
    isOpen: boolean;
    isFlagged: boolean;
    nearbyMines: number;
}

export interface MinesweeperState {
    board: Cell[][];
    gameOver: boolean;
    gameWon: boolean;
    numCols: number,
    numRows: number,
    numMines: number,
    room: string;
    difficulty: string,
    playerJoined: boolean;
    setBoard: (newBoard: Cell[][]) => void;
    setGameOver: (isGameOver: boolean) => void;
    setGameWon: (isGameWon: boolean) => void;
    setRoom: (newRoom: string) => void;
    setPlayerJoined: (isPlayerJoined: boolean) => void;
    setDimensions: (rows: number, cols: number, mines: number, diff: string) => void;
}

export const useMinesweeperStore = create<MinesweeperState>((set, get) => ({
    board: [],
    gameOver: false,
    gameWon: false,
    playerJoined: false,
    numRows: 13,
    numCols: 15,
    numMines: 40,
    difficulty: "Medium",
    room: "",
    setBoard: (newBoard: Cell[][]) => {
        set({ board: newBoard })
    },
    setGameOver: (isGameOver: boolean) => {
        set({ gameOver: isGameOver })
    },
    setGameWon: (isGameWon: boolean) => {
        set({ gameWon: isGameWon })
    },
    setRoom: (newRoom: string) => {
        set({ room: newRoom })
    },
    setPlayerJoined: (isPlayerJoined: boolean) => {
        set({ playerJoined: isPlayerJoined });
    },
    setDimensions: (rows: number, cols: number, mines: number, diff: string) => {
        set({ numRows: rows, numCols: cols, numMines: mines, difficulty: diff });
    }
}));
