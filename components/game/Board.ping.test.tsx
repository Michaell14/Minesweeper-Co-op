// @vitest-environment jsdom
/**
 * Ping interception on the board.
 *
 * This is the risky half of the feature: a click that was meant to POINT at a
 * cell must not also play it. Cell has four render branches acting from four
 * different handlers, which is why the interception lives on the grid in the
 * capture phase rather than inside Cell — and why the assertion that matters
 * here is always the negative one, that `openCell` was not called.
 *
 * The failure this guards is not subtle when it happens: a ping that opens the
 * cell it points at, on a mine, ends the game.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import Board from "./Board";
import type { Cell as CellType } from "@/app/store";

/*
 * jsdom has no ResizeObserver, and the board mounts three overlay layers that
 * measure themselves with one. Stubbed rather than mocked away, so the layers
 * still render — a ping ring sitting over the cell being clicked is exactly the
 * arrangement these tests are about.
 */
class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoopResizeObserver);

const closed = (over: Partial<CellType> = {}): CellType =>
    ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0, ...over });

/** A 2x2 board with one of each branch: closed, open, flagged, revealed mine. */
const board: CellType[][] = [
    [closed(), closed({ isOpen: true, nearbyMines: 3 })],
    [closed({ isFlagged: true }), closed({ isMine: true, isOpen: true })],
];

/*
 * `pingCell` DISARMS, because the real action does — one-shot is the whole
 * design (useGameActions.ts). A plain `vi.fn()` here is a fake that quietly
 * diverges from the thing it stands in for, and it hid a real bug: the arm
 * cleared on mousedown, so the mouseup and click that followed re-asked "is a
 * ping armed?", got "no", and handed the cell back to its own handlers. The
 * ping fired AND the cell opened under it. Caught by the smoke suite; this is
 * the unit-level guard that should have caught it first.
 */
const actions = () => ({
    toggleFlag: vi.fn(),
    openCell: vi.fn(),
    chordCell: vi.fn(),
    emitCellHover: vi.fn(),
    pingCell: vi.fn(() => useMinesweeperStore.getState().setPingArmed(false)),
    handleBoardLeave: vi.fn(),
});

const renderBoard = (props = actions()) => {
    render(<Board {...props} />);
    return props;
};

/** A full left-click, in the order a browser fires it. */
const clickCell = (name: RegExp, init: MouseEventInit = {}) => {
    const cell = screen.getByRole("gridcell", { name });
    // The inner hit areas are what carry Cell's own onClick, so the event has
    // to start where a real pointer would land, not on the wrapper.
    const target = (cell.firstElementChild as HTMLElement) ?? cell;
    fireEvent.mouseDown(target, { button: 0, ...init });
    fireEvent.mouseUp(target, { button: 0, ...init });
    fireEvent.click(target, { button: 0, ...init });
};

beforeEach(() => {
    const store = useMinesweeperStore.getState();
    store.setBoard(board);
    store.setMode("co-op");
    store.setPingArmed(false);
    store.setGameOver(false);
});

afterEach(() => {
    cleanup();
    useMinesweeperStore.getState().setPingArmed(false);
});

describe("with a ping armed", () => {
    it("points at a closed cell instead of opening it", () => {
        const props = renderBoard();
        useMinesweeperStore.getState().setPingArmed(true);

        clickCell(/^Unrevealed cell at row 1, column 1/);

        expect(props.pingCell).toHaveBeenCalledWith(0, 0);
        expect(props.openCell).not.toHaveBeenCalled();
    });

    // The opened-cell branch acts on mouse UP, so an interception that waited
    // for the click would fire after the chord it was replacing.
    it("does not chord an opened number", () => {
        const props = renderBoard();
        useMinesweeperStore.getState().setPingArmed(true);

        clickCell(/^Revealed cell at row 1, column 2/);

        expect(props.pingCell).toHaveBeenCalledWith(0, 1);
        expect(props.chordCell).not.toHaveBeenCalled();
        expect(props.openCell).not.toHaveBeenCalled();
    });

    it("does not unflag a flagged cell", () => {
        const props = renderBoard();
        useMinesweeperStore.getState().setPingArmed(true);

        clickCell(/^Flagged cell at row 2, column 1/);

        expect(props.pingCell).toHaveBeenCalledWith(1, 0);
        expect(props.toggleFlag).not.toHaveBeenCalled();
    });

    it("points at a revealed mine without playing it", () => {
        const props = renderBoard();
        useMinesweeperStore.getState().setPingArmed(true);

        clickCell(/^Mine at row 2, column 2/);

        expect(props.pingCell).toHaveBeenCalledWith(1, 1);
        expect(props.openCell).not.toHaveBeenCalled();
    });
});

describe("Shift as the desktop shortcut", () => {
    it("points without arming first", () => {
        const props = renderBoard();

        clickCell(/^Unrevealed cell at row 1, column 1/, { shiftKey: true });

        expect(props.pingCell).toHaveBeenCalledWith(0, 0);
        expect(props.openCell).not.toHaveBeenCalled();
    });
});

describe("an ordinary click", () => {
    it("still plays the cell", () => {
        const props = renderBoard();

        clickCell(/^Unrevealed cell at row 1, column 1/);

        expect(props.openCell).toHaveBeenCalledWith(0, 0);
        expect(props.pingCell).not.toHaveBeenCalled();
    });
});

describe("PVP", () => {
    /*
     * The client half of the server's rule. Both racers share a board, so a
     * ping is a move hint — the server refuses it, and not emitting keeps a
     * pointless click off the wire and out of the player's rate-limit bucket.
     */
    it("plays the cell rather than pinging, even with Shift held", () => {
        const props = renderBoard();
        useMinesweeperStore.getState().setMode("pvp");
        useMinesweeperStore.getState().setPvpStarted(true);

        clickCell(/^Unrevealed cell at row 1, column 1/, { shiftKey: true });

        expect(props.pingCell).not.toHaveBeenCalled();
        expect(props.openCell).toHaveBeenCalledWith(0, 0);
    });
});

describe("without a ping handler at all", () => {
    // The daily passes none: single-player, nobody to point at.
    it("leaves every click alone", () => {
        const props = actions();
        render(<Board {...props} pingCell={undefined} />);
        useMinesweeperStore.getState().setPingArmed(true);

        clickCell(/^Unrevealed cell at row 1, column 1/);

        expect(props.openCell).toHaveBeenCalledWith(0, 0);
    });
});
