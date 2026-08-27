export type DrillCellState = 'covered' | 'flagged' | 'open' | 'wrong';

/** A drill cell's accessible name. Mirrors components/game/cellLabel.ts. */
export const drillCellLabel = (
    state: DrillCellState,
    row: number,
    col: number,
    nearby: number,
): string => {
    const where = `row ${row + 1}, column ${col + 1}`;
    switch (state) {
        case 'flagged':
            return `Flagged cell at ${where}`;
        case 'wrong':
            return `Wrong guess at ${where}`;
        case 'open':
            return nearby > 0
                ? `Revealed cell at ${where}, ${nearby} nearby ${nearby === 1 ? 'mine' : 'mines'}`
                : `Empty cell at ${where}`;
        default:
            return `Unrevealed cell at ${where}`;
    }
};
