// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import Cell from "./Cell";
import type { Cell as CellType } from "@/app/store";

/**
 * When a cell shows the mine under it.
 *
 * The server is the authority: a closed cell reports `isMine: false` unless the
 * game has ended and it deliberately revealed the layout. But a revealed mine is
 * still CLOSED, so the client needs its own reason to draw a bomb rather than a
 * covered square — and it used to take that reason from `gameOver` alone.
 *
 * `gameOver` means "you hit a mine". The player who LOSES A RACE never did: the
 * opponent finished first, the server sent them their board with every mine in
 * it, and it rendered as an ordinary half-played grid. The one terminal state in
 * the game that showed you nothing.
 *
 * Asserted through the accessible name, because that is what breaks with it: a
 * mine nobody can see is also a mine no screen reader announces.
 */

const closedMine: CellType = { isMine: true, isOpen: false, isFlagged: false, nearbyMines: 0 };

const renderCell = (cell: CellType) =>
    render(
        <Cell
            cell={cell}
            row={0}
            col={0}
            toggleFlag={vi.fn()}
            openCell={vi.fn()}
            chordCell={vi.fn()}
            emitCellHover={vi.fn()}
        />,
    );

const isShownAsAMine = () => screen.queryByRole("gridcell", { name: /^Mine at/ }) !== null;

// The store is a module singleton: what one test writes, the next one inherits.
beforeEach(() => {
    const store = useMinesweeperStore.getState();
    store.setGameOver(false);
    store.setPvpWinner(null);
    store.setMode("co-op");
    store.setPvpStarted(false);
    store.setBothPressed(false);
    useMinesweeperStore.setState((state) => ({
        settings: { ...state.settings, swapMouseButtons: false, chording: true },
    }));
});

describe("a closed cell the server says is a mine", () => {
    test("is hidden while the game is still on", () => {
        // Unreachable in practice — projection would have sent isMine: false —
        // but it pins down that the flag, not the payload, is what shows it.
        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(false);
    });

    test("is shown once this player has hit a mine", () => {
        useMinesweeperStore.getState().setGameOver(true);

        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(true);
    });

    test("is shown to the player who lost a race without hitting one", () => {
        const store = useMinesweeperStore.getState();
        store.setMode("pvp");
        store.setPvpStarted(true);
        store.setPvpWinner("Someone else");   // and gameOver stays false

        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(true);
    });

    test("stays hidden mid-race, while there is no winner", () => {
        const store = useMinesweeperStore.getState();
        store.setMode("pvp");
        store.setPvpStarted(true);

        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(false);
    });

    test("a decided co-op game is unaffected by the PVP branch", () => {
        // pvpWinner can survive a mode change in the store; co-op must not start
        // revealing boards because of a race played earlier in the session.
        useMinesweeperStore.getState().setPvpWinner("Someone else");

        renderCell(closedMine);

        expect(isShownAsAMine()).toBe(false);
    });
});

/**
 * The swap-mouse-buttons setting. Asserted through what each physical button
 * FIRES, because that is the whole feature: the wrong mapping still renders a
 * pixel-perfect board and fails only in the player's hand.
 */
describe("swapped mouse buttons", () => {
    const closed: CellType = { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 };

    const renderClosedWith = (swap: boolean) => {
        useMinesweeperStore.setState((state) => ({
            settings: { ...state.settings, swapMouseButtons: swap },
        }));
        const openCell = vi.fn();
        const toggleFlag = vi.fn();
        render(
            <Cell
                cell={closed}
                row={0}
                col={0}
                toggleFlag={toggleFlag}
                openCell={openCell}
                chordCell={vi.fn()}
                emitCellHover={vi.fn()}
            />,
        );
        return { openCell, toggleFlag };
    };

    const desktopHitArea = () =>
        screen.getByRole("gridcell", { name: /^Unrevealed/ }).querySelector<HTMLElement>(".xl\\:block")!;

    test("default: left opens, right flags", () => {
        const { openCell, toggleFlag } = renderClosedWith(false);
        fireEvent.click(desktopHitArea());
        expect(openCell).toHaveBeenCalledWith(0, 0);
        fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^Unrevealed/ }));
        expect(toggleFlag).toHaveBeenCalledWith(0, 0);
    });

    test("swapped: left flags, right opens", () => {
        const { openCell, toggleFlag } = renderClosedWith(true);
        fireEvent.click(desktopHitArea());
        expect(toggleFlag).toHaveBeenCalledWith(0, 0);
        expect(openCell).not.toHaveBeenCalled();
        fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^Unrevealed/ }));
        expect(openCell).toHaveBeenCalledWith(0, 0);
    });
});

/**
 * Chording on the secondary click — the only one of the three gestures a
 * trackpad can make, having neither a second button nor a middle one.
 *
 * On mouse-UP, since macOS raises `contextmenu` on mousedown and binding it
 * there would chord twice for a right-then-left chord.
 */
describe("chording with the secondary click", () => {
    const openNumber: CellType = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 2 };

    const renderOpenWith = (chording: boolean) => {
        useMinesweeperStore.setState((state) => ({
            settings: { ...state.settings, chording },
        }));
        const chordCell = vi.fn();
        const toggleFlag = vi.fn();
        render(
            <Cell
                cell={openNumber}
                row={1}
                col={2}
                toggleFlag={toggleFlag}
                openCell={vi.fn()}
                chordCell={chordCell}
                emitCellHover={vi.fn()}
            />,
        );
        return { cell: screen.getByRole("gridcell", { name: /^Revealed/ }), chordCell, toggleFlag };
    };

    test("a secondary click on an opened number chords it", () => {
        const { cell, chordCell } = renderOpenWith(true);

        fireEvent.mouseDown(cell, { button: 2 });
        fireEvent.mouseUp(cell, { button: 2 });

        expect(chordCell).toHaveBeenCalledWith(1, 2);
    });

    test("and does not also fire the flag that click used to mean", () => {
        const { cell, chordCell, toggleFlag } = renderOpenWith(true);

        fireEvent.mouseDown(cell, { button: 2 });
        fireEvent.mouseUp(cell, { button: 2 });

        expect(chordCell).toHaveBeenCalledTimes(1);
        expect(toggleFlag).not.toHaveBeenCalled();
    });

    test("a release that finishes a both-buttons chord does not chord again", () => {
        // Before the render: a mid-test store write does not reach a mounted
        // component outside act().
        useMinesweeperStore.getState().setBothPressed(true);
        const { cell, chordCell } = renderOpenWith(true);

        fireEvent.mouseUp(cell, { button: 2 });

        expect(chordCell).not.toHaveBeenCalled();
    });

    test("with chording off it stays the no-op flag it always was", () => {
        const { cell, chordCell, toggleFlag } = renderOpenWith(false);

        fireEvent.mouseDown(cell, { button: 2 });
        fireEvent.mouseUp(cell, { button: 2 });

        expect(chordCell).not.toHaveBeenCalled();
        expect(toggleFlag).toHaveBeenCalledWith(1, 2);
    });

    // Only opened cells spend it; on a closed one it is the only way to flag.
    test("a secondary click on a closed cell still flags", () => {
        const chordCell = vi.fn();
        const toggleFlag = vi.fn();
        render(
            <Cell
                cell={{ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }}
                row={1}
                col={2}
                toggleFlag={toggleFlag}
                openCell={vi.fn()}
                chordCell={chordCell}
                emitCellHover={vi.fn()}
            />,
        );

        fireEvent.contextMenu(screen.getByRole("gridcell", { name: /^Unrevealed/ }));

        expect(toggleFlag).toHaveBeenCalledWith(1, 2);
        expect(chordCell).not.toHaveBeenCalled();
    });
});

/**
 * The press affordance — the cell sinking to the opened face under the button,
 * which is what stands in for the reveal while the server round trip runs.
 *
 * Asserted on the attribute rather than the paint, because the paint is what
 * jsdom cannot see. What the attribute encodes is the whole decision: the press
 * is a promise that THIS button will open THIS cell, so it must not appear for
 * the button that flags, for the one that chords, or on a board that is going to
 * ignore the click. It started as `:active`, which cannot express any of that —
 * CSS is not told which button is down.
 */
describe("the press affordance", () => {
    const closed: CellType = { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 };

    const renderClosed = (swap = false) => {
        useMinesweeperStore.setState((state) => ({
            settings: { ...state.settings, swapMouseButtons: swap },
        }));
        render(
            <Cell
                cell={closed}
                row={0}
                col={0}
                toggleFlag={vi.fn()}
                openCell={vi.fn()}
                chordCell={vi.fn()}
                emitCellHover={vi.fn()}
            />,
        );
        return screen.getByRole("gridcell", { name: /^Unrevealed/ });
    };

    const isPressed = (cell: HTMLElement) => cell.hasAttribute("data-pressed");

    test("the left button presses it", () => {
        const cell = renderClosed();

        fireEvent.mouseDown(cell, { button: 0 });

        expect(isPressed(cell)).toBe(true);
    });

    test("releasing lets it back up", () => {
        const cell = renderClosed();

        fireEvent.mouseDown(cell, { button: 0 });
        fireEvent.mouseUp(cell, { button: 0 });

        expect(isPressed(cell)).toBe(false);
    });

    /*
     * The right button flags. Depressing the cell would show the opened face
     * for as long as the button is held — and on Windows the flag does not even
     * land until mouseup, so the wrong affordance is on screen the whole time.
     */
    test("the button that flags does not press it", () => {
        const cell = renderClosed();

        fireEvent.mouseDown(cell, { button: 2 });

        expect(isPressed(cell)).toBe(false);
    });

    test("nor does the middle button, which chords", () => {
        const cell = renderClosed();

        fireEvent.mouseDown(cell, { button: 1 });

        expect(isPressed(cell)).toBe(false);
    });

    /*
     * Under the swap setting the mapping inverts, and so must the press —
     * otherwise every left-click these players make depresses the cell and then
     * plants a flag in it.
     */
    test("swapped: the right button presses it", () => {
        const cell = renderClosed(true);

        fireEvent.mouseDown(cell, { button: 2 });

        expect(isPressed(cell)).toBe(true);
    });

    test("swapped: the left button does not", () => {
        const cell = renderClosed(true);

        fireEvent.mouseDown(cell, { button: 0 });

        expect(isPressed(cell)).toBe(false);
    });

    test("a board waiting for the race to start takes no press", () => {
        const store = useMinesweeperStore.getState();
        store.setMode("pvp");
        store.setPvpStarted(false);

        const cell = renderClosed();
        fireEvent.mouseDown(cell, { button: 0 });

        expect(isPressed(cell)).toBe(false);
    });

    /*
     * The cell can change branch mid-press — it opens, or takes a flag — and
     * lose the mouseup handler that would have cleared this. Leaving is the
     * backstop, and every branch wires it.
     */
    test("leaving the cell clears a press left behind", () => {
        const cell = renderClosed();

        fireEvent.mouseDown(cell, { button: 0 });
        fireEvent.mouseLeave(cell);

        expect(isPressed(cell)).toBe(false);
    });
});
