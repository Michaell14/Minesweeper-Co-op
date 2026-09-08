import { StateCreator } from 'zustand';
import type { MinesweeperState } from './store';

/**
 * Transient pointer state shared between Cell (writes) and Grid (watches for a
 * chord). `bothPressed` stops a chord's release from also firing open/flag.
 */
export interface InputSlice {
    isChecked: boolean;     // mobile: true = tap opens, false = tap flags
    r: number;              // row under the cursor, -1 for none
    c: number;              // column under the cursor, -1 for none
    leftClick: boolean;
    rightClick: boolean;
    bothPressed: boolean;
    /** Keyboard selection on the board; null = hidden. */
    kbCursor: { r: number; c: number } | null;
    /**
     * The next click on a cell points at it instead of playing it. ONE-SHOT and
     * self-clearing, so the worst case is one wasted tap; also touch's only ping path.
     */
    pingArmed: boolean;

    setIsChecked: (checked: boolean) => void;
    setCoord: (newR: number, newC: number) => void;
    setLeftClick: (lClick: boolean) => void;
    setRightClick: (rClick: boolean) => void;
    setBothPressed: (bothPressed: boolean) => void;
    setKbCursor: (cursor: { r: number; c: number } | null) => void;
    setPingArmed: (armed: boolean) => void;
}

export const createInputSlice: StateCreator<MinesweeperState, [], [], InputSlice> = (set) => ({
    isChecked: true,        // click mode, not flag mode
    r: -1,
    c: -1,
    leftClick: false,
    rightClick: false,
    bothPressed: false,
    kbCursor: null,
    pingArmed: false,

    setIsChecked: (checked) => set({ isChecked: checked }),
    setCoord: (newR, newC) => set({ r: newR, c: newC }),
    setLeftClick: (lClick) => set({ leftClick: lClick }),
    setRightClick: (rClick) => set({ rightClick: rClick }),
    setBothPressed: (bothPressed) => set({ bothPressed }),
    setKbCursor: (kbCursor) => set({ kbCursor }),
    setPingArmed: (pingArmed) => set({ pingArmed }),
});
