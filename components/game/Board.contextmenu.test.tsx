// @vitest-environment jsdom
/**
 * A right click anywhere on the board must not open the browser's menu — the
 * gaps between cells belong to the board and rows, not to a cell, so the
 * cells' own handlers never saw them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import Board from "./Board";
import type { Cell as CellType } from "@/app/store";

class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoopResizeObserver);

const closed = (over: Partial<CellType> = {}): CellType =>
    ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0, ...over });

const board: CellType[][] = [
    [closed(), closed({ isOpen: true, nearbyMines: 3 })],
    [closed({ isFlagged: true }), closed({ isMine: true, isOpen: true })],
];

const actions = () => ({
    toggleFlag: vi.fn(),
    openCell: vi.fn(),
    chordCell: vi.fn(),
    emitCellHover: vi.fn(),
    handleBoardLeave: vi.fn(),
});

beforeEach(() => {
    const store = useMinesweeperStore.getState();
    store.setBoard(board);
    store.setMode("co-op");
    store.setGameOver(false);
});

afterEach(cleanup);

describe("right click on the board", () => {
    it("is swallowed in the gap between rows", () => {
        render(<Board {...actions()} />);
        // fireEvent returns false when the default was prevented.
        expect(fireEvent.contextMenu(screen.getByRole("grid"))).toBe(false);
    });

    it("is swallowed in the gap between cells of a row", () => {
        render(<Board {...actions()} />);
        expect(fireEvent.contextMenu(screen.getAllByRole("row")[0])).toBe(false);
    });

    it("is swallowed on a revealed mine, which has no handler of its own", () => {
        render(<Board {...actions()} />);
        expect(fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^Mine at/ }))).toBe(false);
    });

    it("still flags a closed cell", () => {
        const props = actions();
        render(<Board {...props} />);
        fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^Unrevealed/ }));
        expect(props.toggleFlag).toHaveBeenCalledWith(0, 0);
    });
});
