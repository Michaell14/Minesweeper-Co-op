/**
 * Zustand Store for Minesweeper Co-op Game State
 * Centralized state management for all game-related data
 */
import { create } from 'zustand';

/**
 * Cell Interface
 * Represents a single cell in the Minesweeper grid
 */
export interface Cell {
    isMine: boolean;        // True if this cell contains a mine
    isOpen: boolean;        // True if cell has been revealed
    isFlagged: boolean;     // True if player has flagged this cell
    nearbyMines: number;    // Count of mines in adjacent cells (0-8)
}

/**
 * Player Statistics Interface
 * Track individual player performance in a room
 */
export interface PlayerStats {
    name: string;           // Player's display name
    score: number;          // Points earned (cells revealed)
}

/**
 * Minesweeper State Interface
 * Complete type definition for the game store
 */
export interface MinesweeperState {
    // ============================================================================
    // GAME STATE
    // ============================================================================
    board: Cell[][];        // 2D array representing the game board
    gameOver: boolean;      // True when someone hits a mine
    gameWon: boolean;       // True when all non-mine cells are revealed

    // ============================================================================
    // BOARD CONFIGURATION
    // ============================================================================
    numRows: number;        // Board height (from difficulty settings)
    numCols: number;        // Board width (from difficulty settings)
    numMines: number;       // Number of mines on board
    difficulty: string;     // "Easy", "Medium", "Hard", or "Custom"

    // ============================================================================
    // ROOM & PLAYER DATA
    // ============================================================================
    room: string;           // Current room code
    playerJoined: boolean;  // True if player is in a room
    name: string;           // Current player's display name
    playerStatsInRoom: PlayerStats[]; // All players' scores in current room
    gameOverName: string;   // Name of player who hit a mine

    // ============================================================================
    // UI STATE (Mobile flag mode, mouse tracking for chording)
    // ============================================================================
    isChecked: boolean;     // Mobile: true = click mode, false = flag mode
    r: number;              // Current mouse row coordinate (-1 if none)
    c: number;              // Current mouse column coordinate (-1 if none)
    leftClick: boolean;     // True if left mouse button is pressed
    rightClick: boolean;    // True if right mouse button is pressed
    bothPressed: boolean;   // True if both buttons pressed (for chording)

    // ============================================================================
    // STATE SETTERS
    // ============================================================================
    setBoard: (newBoard: Cell[][]) => void;
    setGameOver: (isGameOver: boolean) => void;
    setGameWon: (isGameWon: boolean) => void;
    setRoom: (newRoom: string) => void;
    setPlayerJoined: (isPlayerJoined: boolean) => void;
    setDimensions: (rows: number, cols: number, mines: number) => void;
    setName: (newName: string) => void;
    setPlayerStatsInRoom: (newStats: PlayerStats[]) => void;
    setDifficulty: (diff: string) => void;
    setIsChecked: (checked: boolean) => void;
    setCoord: (newR: number, newC: number) => void;
    setLeftClick: (lClick: boolean) => void;
    setRightClick: (rClick: boolean) => void;
    setBothPressed: (bothPressed: boolean) => void;
    setCell: (row: number, col: number, newCell: Cell) => void;
    setGameOverName: (gameOverName: string) => void;
}

/**
 * Create Zustand Store
 * Single source of truth for all game state
 */
export const useMinesweeperStore = create<MinesweeperState>((set, get) => ({
    // ============================================================================
    // INITIAL STATE
    // ============================================================================

    // Game State
    board: [],              // Empty board until room is joined
    gameOver: false,
    gameWon: false,

    // Board Configuration (defaults to Medium difficulty)
    numRows: 16,
    numCols: 16,
    numMines: 40,
    difficulty: "Medium",

    // Room & Player Data
    room: "",               // No room until player creates/joins one
    name: "",               // No name until player enters one
    playerJoined: false,
    playerStatsInRoom: [],
    gameOverName: "",

    // UI State
    isChecked: true,        // Default to click mode (not flag mode)
    r: -1,                  // No mouse position initially
    c: -1,
    leftClick: false,
    rightClick: false,
    bothPressed: false,

    // ============================================================================
    // SETTERS
    // ============================================================================

    /**
     * Replace the entire board (used when joining room or resetting)
     */
    setBoard: (newBoard: Cell[][]) => {
        set({ board: newBoard });
    },

    /**
     * Set game over state (someone hit a mine)
     */
    setGameOver: (isGameOver: boolean) => {
        set({ gameOver: isGameOver });
    },

    /**
     * Set game won state (all non-mine cells revealed)
     */
    setGameWon: (isGameWon: boolean) => {
        set({ gameWon: isGameWon });
    },

    /**
     * Set current room code
     */
    setRoom: (newRoom: string) => {
        set({ room: newRoom });
    },

    /**
     * Set whether player has joined a room
     */
    setPlayerJoined: (isPlayerJoined: boolean) => {
        set({ playerJoined: isPlayerJoined });
    },

    /**
     * Set board dimensions and mine count (from difficulty selection)
     */
    setDimensions: (rows: number, cols: number, mines: number) => {
        set({ numRows: rows, numCols: cols, numMines: mines });
    },

    /**
     * Set difficulty level name
     */
    setDifficulty: (diff: string) => {
        set({ difficulty: diff });
    },

    /**
     * Set player's display name
     */
    setName: (newName: string) => {
        set({ name: newName });
    },

    /**
     * Update player statistics for all players in room
     */
    setPlayerStatsInRoom: (newStats: PlayerStats[]) => {
        set({ playerStatsInRoom: newStats });
    },

    /**
     * Toggle mobile mode (click vs flag mode)
     */
    setIsChecked: (checked: boolean) => {
        set({ isChecked: checked });
    },

    /**
     * Set current mouse coordinates (for chording detection)
     */
    setCoord: (newR: number, newC: number) => {
        set({ r: newR, c: newC });
    },

    /**
     * Set left mouse button state
     */
    setLeftClick: (lClick: boolean) => {
        set({ leftClick: lClick });
    },

    /**
     * Set right mouse button state
     */
    setRightClick: (rClick: boolean) => {
        set({ rightClick: rClick });
    },

    /**
     * Set both buttons pressed state (for chording)
     */
    setBothPressed: (bothPressed: boolean) => {
        set({ bothPressed: bothPressed });
    },

    /**
     * Update a single cell in the board
     * More efficient than replacing entire board
     */
    setCell: (row: number, col: number, newCell: Cell) => {
        set((state) => {
            const newBoard = state.board.map((r, rowIndex) =>
                r.map((c, colIndex) => (rowIndex === row && colIndex === col ? newCell : c))
            );
            return { ...state, board: newBoard };
        });
    },

    /**
     * Set name of player who caused game over
     */
    setGameOverName: (gameOverName: string) => {
        set({ gameOverName: gameOverName });
    }
}));
