import type { Cell } from '@/state/types';

/**
 * The accessible name of a cell, shared by Cell's aria-label and the keyboard
 * cursor's live region. The unit tests and the smoke suite both find cells by
 * these exact strings.
 */
export const cellAriaLabel = (cell: Cell, row: number, col: number, minesRevealed: boolean): string => {
    if (cell.isMine && (cell.isOpen || minesRevealed)) {
        return `Mine at row ${row + 1}, column ${col + 1}`;
    }
    if (cell.isOpen) {
        return cell.nearbyMines > 0
            ? `Revealed cell at row ${row + 1}, column ${col + 1}, ${cell.nearbyMines} nearby ${cell.nearbyMines === 1 ? 'mine' : 'mines'}`
            : `Empty cell at row ${row + 1}, column ${col + 1}`;
    }
    if (cell.isFlagged) {
        return `Flagged cell at row ${row + 1}, column ${col + 1}`;
    }
    return `Unrevealed cell at row ${row + 1}, column ${col + 1}`;
};
