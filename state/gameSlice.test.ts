import { beforeEach, describe, expect, test } from "vitest";
import { useMinesweeperStore } from "@/state/store";
import type { Cell } from "@/state/types";

/**
 * `setCells` — the write behind every reveal.
 *
 * It replaced a per-cell setter that rebuilt the whole board each time, so what
 * matters here is not only that the right cells change but that the ones around
 * them keep their IDENTITY: `Cell` is memoized on cell state, and a row rebuilt
 * for no reason re-renders every cell in it. A 16x30 board holds 480 of them and
 * a cascade can touch ninety, which is where this stopped being free.
 */

const closed = (): Cell => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 });

const state = () => useMinesweeperStore.getState();

const board3x3 = () => [
    [closed(), closed(), closed()],
    [closed(), closed(), closed()],
    [closed(), closed(), closed()],
];

beforeEach(() => {
    state().setBoard(board3x3());
});

describe("setCells", () => {
    test("applies every cell in the batch", () => {
        state().setCells([
            { ...closed(), isOpen: true, nearbyMines: 3, row: 0, col: 0 },
            { ...closed(), isOpen: true, nearbyMines: 1, row: 2, col: 2 },
        ]);

        expect(state().board[0][0]).toMatchObject({ isOpen: true, nearbyMines: 3 });
        expect(state().board[2][2]).toMatchObject({ isOpen: true, nearbyMines: 1 });
    });

    test("leaves untouched rows exactly as they were", () => {
        const before = state().board;

        state().setCells([{ ...closed(), isOpen: true, row: 1, col: 1 }]);

        expect(state().board[0]).toBe(before[0]);
        expect(state().board[2]).toBe(before[2]);
        expect(state().board[1]).not.toBe(before[1]);
    });

    test("leaves untouched cells in a touched row alone", () => {
        const before = state().board;

        state().setCells([{ ...closed(), isOpen: true, row: 1, col: 1 }]);

        expect(state().board[1][0]).toBe(before[1][0]);
        expect(state().board[1][2]).toBe(before[1][2]);
    });

    test("does not mutate the board it was handed", () => {
        const before = state().board;

        state().setCells([{ ...closed(), isOpen: true, row: 1, col: 1 }]);

        expect(before[1][1].isOpen).toBe(false);
        expect(state().board).not.toBe(before);
    });

    test("keeps a cell to its four fields, whatever the payload carries", () => {
        // The server's CellUpdate carries row and col as well, and a board cell
        // is only ever { isMine, isOpen, isFlagged, nearbyMines }.
        state().setCells([{ ...closed(), isOpen: true, row: 0, col: 0 }]);

        expect(Object.keys(state().board[0][0]).sort()).toEqual([
            "isFlagged",
            "isMine",
            "isOpen",
            "nearbyMines",
        ]);
    });

    test("an off-board coordinate is skipped, not a crash", () => {
        expect(() => state().setCells([{ ...closed(), isOpen: true, row: 9, col: 9 }])).not.toThrow();
    });

    test("an empty batch leaves the board identical", () => {
        const before = state().board;

        state().setCells([]);

        expect(state().board).toBe(before);
    });
});

describe("toggleCellFlag", () => {
    test("flags and unflags", () => {
        state().toggleCellFlag(1, 1);
        expect(state().board[1][1].isFlagged).toBe(true);

        state().toggleCellFlag(1, 1);
        expect(state().board[1][1].isFlagged).toBe(false);
    });

    /*
     * Re-checked here rather than trusted from the caller: useGameActions reads
     * the board before emitting, and a teammate's reveal can land in between.
     */
    test("refuses an open cell, as the server does", () => {
        state().setCells([{ ...closed(), isOpen: true, row: 1, col: 1 }]);
        const before = state().board;

        state().toggleCellFlag(1, 1);

        expect(state().board).toBe(before);
    });

    test("an off-board coordinate is a no-op, not a crash", () => {
        const before = state().board;

        expect(() => state().toggleCellFlag(9, 9)).not.toThrow();
        expect(state().board).toBe(before);
    });

    test("leaves the rest of the row alone", () => {
        const before = state().board;

        state().toggleCellFlag(1, 1);

        expect(state().board[1][0]).toBe(before[1][0]);
        expect(state().board[0]).toBe(before[0]);
    });
});
