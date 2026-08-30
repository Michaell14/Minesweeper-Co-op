/** Naming the deduction a lost run missed, and the drill that teaches it. */

import type { Cell } from '@/shared/socketPayloads';

/**
 * A live position in the layout format lib/drillDeduction.ts consumes.
 *
 * Flags are dropped deliberately: deduce() re-derives mines from the opened
 * numbers, so a wrong flag cannot make the diagnosis lie.
 */
export function positionToLayout(preLoss: Cell[][], revealed: Cell[][]): string[] {
    return preLoss.map((row, r) =>
        row
            .map((cell, c) => {
                if (cell.isOpen) return cell.nearbyMines === 0 ? '.' : String(cell.nearbyMines);
                return revealed[r]?.[c]?.isMine ? '*' : '#';
            })
            .join(''),
    );
}
