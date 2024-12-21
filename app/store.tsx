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
    room: string;
    playerJoined: boolean;
    setBoard: (newBoard: Cell[][]) => void;
    setGameOver: (isGameOver: boolean) => void;
    setGameWon: (isGameWon: boolean) => void;
    setRoom: (newRoom: string) => void;
    setPlayerJoined: (isPlayerJoined: boolean) => void;
}

const BOARD_SIZE = 8;
const NUM_MINES = 10;

export const useMinesweeperStore = create<MinesweeperState>((set, get) => ({
    board: [],
    gameOver: false,
    gameWon: false,
    playerJoined: false,
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
        set({ playerJoined: isPlayerJoined});
    }
}));
