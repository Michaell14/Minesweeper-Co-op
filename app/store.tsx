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
    r: number,
    c: number,
    leftClick: boolean,
    rightClick: boolean,
    bothPressed: boolean,
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
    setCoord: (newR: number, newC: number) => void;
    setLeftClick: (lClick: boolean) => void;
    setRightClick: (rClick: boolean) => void;
    setBothPressed: (bothPressed: boolean) => void;
    setCell: (row: number, col: number, newCell: Cell) => void;
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
    leftClickTime: -1,
    rightClickTime: -1,
    r: -1,
    c: -1,
    leftTimeout: null,
    rightTimeout: null,
    leftClick: false,
    rightClick: false,
    bothPressed: false,
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
    },
    setCoord: (newR: number, newC: number) => {
        set({ r: newR, c: newC })
    },
    setLeftClick: (lClick: boolean) => {
        set({ leftClick: lClick })
    },
    setRightClick: (rClick: boolean) => {     
        set({ rightClick: rClick })
    },
    setBothPressed: (bothPressed: boolean) => {
        set({ bothPressed: bothPressed })
    },
    setCell: (row: number, col: number, newCell: Cell) => {
        set((state) => {
            const newBoard = state.board.map((r, rowIndex) =>
                r.map((c, colIndex) => (rowIndex === row && colIndex === col ? newCell : c))
            );
            return { ...state, board: newBoard };
        });
    },
}));
