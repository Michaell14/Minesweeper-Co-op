/** Shared value types for the client store. */

/** A single cell. Closed cells arrive with isMine false and nearbyMines 0 — see ARCHITECTURE.md §3.1. */
export interface Cell {
    isMine: boolean;        // True if this cell contains a mine
    isOpen: boolean;        // True if cell has been revealed
    isFlagged: boolean;     // True if a player has flagged this cell
    nearbyMines: number;    // Count of mines in adjacent cells (0-8)
}

/** One row of the co-op leaderboard. */
export interface PlayerStats {
    name: string;
    score: number;          // Points earned (cells revealed)
}

/** Which cell another player is hovering, and the colour derived from their id. */
export interface PlayerHover {
    row: number;
    col: number;
    name: string;
    color: string;
}
