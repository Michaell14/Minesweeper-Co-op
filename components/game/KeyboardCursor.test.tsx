// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import type { Cell } from "@/state/types";
import KeyboardCursor from "./KeyboardCursor";

/**
 * The overlay's silent failures: the frame marking the cell, and the live
 * region announcing it. jsdom has no layout, so position is smoke-suite territory.
 */

const closed = (): Cell => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 });

const state = () => useMinesweeperStore.getState();

const renderCursor = () => {
    const boardRef = React.createRef<HTMLDivElement>();
    return render(<KeyboardCursor boardRef={boardRef} />);
};

beforeEach(() => {
    // useCellMetrics needs a ResizeObserver jsdom does not ship.
    vi.stubGlobal("ResizeObserver", class {
        observe() {}
        unobserve() {}
        disconnect() {}
    });
    act(() => {
        state().setBoard([
            [closed(), closed()],
            [closed(), closed()],
        ]);
        state().setKbCursor(null);
        state().setGameOver(false);
        state().setMode("co-op");
    });
});

test("hidden cursor: no frame, and the live region is mounted but silent", () => {
    renderCursor();

    expect(document.querySelector("[data-kb-cursor]")).toBeNull();
    // Mounted empty: a region appearing with its first text may never be announced.
    expect(screen.getByRole("status").textContent).toBe("");
});

test("a visible cursor draws the frame and announces the cell", () => {
    renderCursor();
    act(() => state().setKbCursor({ r: 1, c: 0 }));

    expect(document.querySelector("[data-kb-cursor]")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Unrevealed cell at row 2, column 1");
});

test("the announcement follows the cell's state", () => {
    renderCursor();
    act(() => {
        state().setKbCursor({ r: 0, c: 0 });
        state().toggleCellFlag(0, 0);
    });

    expect(screen.getByRole("status").textContent).toBe("Flagged cell at row 1, column 1");
});

test("an out-of-bounds cursor renders no frame", () => {
    renderCursor();
    act(() => state().setKbCursor({ r: 7, c: 7 }));

    expect(document.querySelector("[data-kb-cursor]")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
});
