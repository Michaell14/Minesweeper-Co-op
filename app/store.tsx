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
    isChecked: boolean,
    name: string;
    playerNamesInRoom: any[];
    setBoard: (newBoard: Cell[][]) => void;
    setGameOver: (isGameOver: boolean) => void;
    setGameWon: (isGameWon: boolean) => void;
    setRoom: (newRoom: string) => void;
    setPlayerJoined: (isPlayerJoined: boolean) => void;
    setDimensions: (rows: number, cols: number, mines: number) => void;
    setName: (newName: string) => void;
    setPlayerNamesInRoom: (newNames: any[]) => void;
    setDifficulty: (diff: string) => void;
    setIsChecked: (checked: boolean) => void;
}

export const useMinesweeperStore = create<MinesweeperState>((set, get) => ({
    board: [],
    gameOver: false,
    gameWon: false,
    playerJoined: false,
    isChecked: true,
    numRows: 15,
    numCols: 13,
    numMines: 40,
    difficulty: "Medium",
    room: "",
    name: "",
    playerNamesInRoom: [],
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
    setDimensions: (rows: number, cols: number, mines: number) => {
        set({ numRows: rows, numCols: cols, numMines: mines });
    },
    setDifficulty: (diff: string) => {
        set({ difficulty: diff })
    },
    setName: (newName: string) => {
        set({ name: newName })
    },
    setPlayerNamesInRoom: (newNames: any[]) => {
        set({ playerNamesInRoom: newNames });
    },
    setIsChecked: (checked: boolean) => {
        set({ isChecked: checked })
    }
}));
