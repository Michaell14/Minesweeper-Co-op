import { StateCreator } from 'zustand';
import type { MinesweeperState } from './store';

/**
 * Transient pointer state, shared between Cell (which writes it) and Grid (which
 * watches for a chord). Input state, not game state — it lives in the store only
 * because many Cells and one Grid must see the same values. `bothPressed` is
 * what stops the release of a chord from also firing open/flag.
 */
export interface InputSlice {
    isChecked: boolean;     // mobile: true = tap opens, false = tap flags
    r: number;              // row under the cursor, -1 for none
    c: number;              // column under the cursor, -1 for none
    leftClick: boolean;
    rightClick: boolean;
    bothPressed: boolean;

    setIsChecked: (checked: boolean) => void;
    setCoord: (newR: number, newC: number) => void;
    setLeftClick: (lClick: boolean) => void;
    setRightClick: (rClick: boolean) => void;
    setBothPressed: (bothPressed: boolean) => void;
}

export const createInputSlice: StateCreator<MinesweeperState, [], [], InputSlice> = (set) => ({
    isChecked: true,        // click mode, not flag mode
    r: -1,
    c: -1,
    leftClick: false,
    rightClick: false,
    bothPressed: false,

    setIsChecked: (checked) => set({ isChecked: checked }),
    setCoord: (newR, newC) => set({ r: newR, c: newC }),
    setLeftClick: (lClick) => set({ leftClick: lClick }),
    setRightClick: (rClick) => set({ rightClick: rClick }),
    setBothPressed: (bothPressed) => set({ bothPressed }),
});
