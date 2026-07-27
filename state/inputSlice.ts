import { StateCreator } from 'zustand';
import type { MinesweeperState } from './store';

/**
 * Transient pointer state, shared between Cell (which writes it) and Grid
 * (which watches for a chord).
 *
 * This is input state rather than game state: it lives in the store only because
 * many Cells and one Grid need to see the same values. Chording is the reason
 * it exists — pressing both buttons on an opened number chords it, and
 * `bothPressed` stops the release from also firing open/flag.
 */
export interface InputSlice {
    isChecked: boolean;     // Mobile: true = tap opens, false = tap flags
    r: number;              // Row under the cursor, -1 for none
    c: number;              // Column under the cursor, -1 for none
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
    isChecked: true,        // Default to click mode, not flag mode
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
