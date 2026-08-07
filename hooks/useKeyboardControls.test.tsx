// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { Cell } from "@/state/types";
import { useKeyboardControls } from "./useKeyboardControls";

/**
 * Keyboard play. The hook owns window listeners and reads the store at event
 * time, so everything here is: seed the store, dispatch a real KeyboardEvent on
 * the window, assert on the action mocks and on kbCursor.
 */

const closed = (): Cell => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 });
const open = (nearbyMines: number): Cell => ({ isMine: false, isOpen: true, isFlagged: false, nearbyMines });
const flagged = (): Cell => ({ isMine: false, isOpen: false, isFlagged: true, nearbyMines: 0 });

/** A 3x3 all-closed board; the centre (1,1) is where the cursor first shows. */
const closedBoard = () => [
    [closed(), closed(), closed()],
    [closed(), closed(), closed()],
    [closed(), closed(), closed()],
];

const state = () => useMinesweeperStore.getState();

const actions = () => ({
    openCell: vi.fn(),
    toggleFlag: vi.fn(),
    chordCell: vi.fn(),
    emitCellHover: vi.fn(),
});

const Probe = (props: ReturnType<typeof actions>) => {
    useKeyboardControls(props);
    return null;
};

const key = (k: string, init: KeyboardEventInit = {}) =>
    act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: k, cancelable: true, ...init }));
    });

beforeEach(() => {
    act(() => {
        state().setBoard(closedBoard());
        state().setKbCursor(null);
        state().setGameOver(false);
        state().setMode("co-op");
        state().setPvpStarted(false);
    });
    useMinesweeperStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

afterEach(() => {
    document.body.innerHTML = "";
});

describe("movement", () => {
    test("first arrow shows the cursor at the centre without moving", () => {
        const a = actions();
        render(<Probe {...a} />);

        key("ArrowRight");

        expect(state().kbCursor).toEqual({ r: 1, c: 1 });
        expect(a.emitCellHover).toHaveBeenCalledWith(1, 1);
    });

    test("later arrows move, and the edges clamp instead of wrapping", () => {
        const a = actions();
        render(<Probe {...a} />);

        key("ArrowRight"); // shows at (1,1)
        key("ArrowRight");
        expect(state().kbCursor).toEqual({ r: 1, c: 2 });
        key("ArrowRight"); // already at the edge
        expect(state().kbCursor).toEqual({ r: 1, c: 2 });
        key("ArrowUp");
        key("ArrowUp");
        expect(state().kbCursor).toEqual({ r: 0, c: 2 });
    });

    test("WASD moves too", () => {
        const a = actions();
        render(<Probe {...a} />);

        key("d"); // shows
        key("s");
        expect(state().kbCursor).toEqual({ r: 2, c: 1 });
        key("a");
        expect(state().kbCursor).toEqual({ r: 2, c: 0 });
        key("w");
        expect(state().kbCursor).toEqual({ r: 1, c: 0 });
    });

    test("a held arrow keeps moving (repeat is allowed for movement)", () => {
        render(<Probe {...actions()} />);

        key("ArrowRight");
        key("ArrowDown", { repeat: true });
        expect(state().kbCursor).toEqual({ r: 2, c: 1 });
    });

    test("a stale out-of-bounds cursor clamps back onto the board", () => {
        render(<Probe {...actions()} />);
        act(() => state().setKbCursor({ r: 9, c: 9 }));

        key("ArrowDown");

        expect(state().kbCursor).toEqual({ r: 2, c: 2 });
    });

    test("no board, no cursor", () => {
        render(<Probe {...actions()} />);
        act(() => state().setBoard([]));

        key("ArrowRight");

        expect(state().kbCursor).toBeNull();
    });
});

describe("actions", () => {
    test("Space reveals a closed cell", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setKbCursor({ r: 0, c: 2 }));

        key(" ");

        expect(a.openCell).toHaveBeenCalledWith(0, 2);
    });

    test("Enter reveals too", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setKbCursor({ r: 2, c: 0 }));

        key("Enter");

        expect(a.openCell).toHaveBeenCalledWith(2, 0);
    });

    test("F toggles the flag", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setKbCursor({ r: 1, c: 1 }));

        key("f");

        expect(a.toggleFlag).toHaveBeenCalledWith(1, 1);
        expect(a.openCell).not.toHaveBeenCalled();
    });

    test("Space on a flagged cell does nothing — the flag protects it", () => {
        const a = actions();
        const board = closedBoard();
        board[1][1] = flagged();
        render(<Probe {...a} />);
        act(() => {
            state().setBoard(board);
            state().setKbCursor({ r: 1, c: 1 });
        });

        key(" ");

        expect(a.openCell).not.toHaveBeenCalled();
        expect(a.chordCell).not.toHaveBeenCalled();
    });

    test("Space on an open number chords, when chording is on", () => {
        const a = actions();
        const board = closedBoard();
        board[1][1] = open(2);
        render(<Probe {...a} />);
        act(() => {
            state().setBoard(board);
            state().setKbCursor({ r: 1, c: 1 });
        });

        key(" ");

        expect(a.chordCell).toHaveBeenCalledWith(1, 1);
        expect(a.openCell).not.toHaveBeenCalled();
    });

    test("...and does nothing with chording off", () => {
        const a = actions();
        const board = closedBoard();
        board[1][1] = open(2);
        useMinesweeperStore.setState((s) => ({ settings: { ...s.settings, chording: false } }));
        render(<Probe {...a} />);
        act(() => {
            state().setBoard(board);
            state().setKbCursor({ r: 1, c: 1 });
        });

        key(" ");

        expect(a.chordCell).not.toHaveBeenCalled();
    });

    test("Space on an open BLANK never chords — the server would refuse it", () => {
        const a = actions();
        const board = closedBoard();
        board[1][1] = open(0);
        render(<Probe {...a} />);
        act(() => {
            state().setBoard(board);
            state().setKbCursor({ r: 1, c: 1 });
        });

        key(" ");

        expect(a.chordCell).not.toHaveBeenCalled();
        expect(a.openCell).not.toHaveBeenCalled();
    });

    test("auto-repeat is dropped for actions", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setKbCursor({ r: 0, c: 0 }));

        key(" ", { repeat: true });
        key("f", { repeat: true });

        expect(a.openCell).not.toHaveBeenCalled();
        expect(a.toggleFlag).not.toHaveBeenCalled();
    });

    test("no cursor, no action", () => {
        const a = actions();
        render(<Probe {...a} />);

        key(" ");
        key("f");

        expect(a.openCell).not.toHaveBeenCalled();
        expect(a.toggleFlag).not.toHaveBeenCalled();
    });
});

describe("PVP pre-start", () => {
    test("movement works, actions are blocked until the race starts", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setMode("pvp"));

        key("ArrowRight");
        expect(state().kbCursor).toEqual({ r: 1, c: 1 });

        key(" ");
        expect(a.openCell).not.toHaveBeenCalled();

        act(() => state().setPvpStarted(true));
        key(" ");
        expect(a.openCell).toHaveBeenCalledWith(1, 1);
    });
});

describe("dismissal", () => {
    test("Escape hides the cursor and clears the shared hover", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setKbCursor({ r: 1, c: 1 }));

        key("Escape");

        expect(state().kbCursor).toBeNull();
        expect(a.emitCellHover).toHaveBeenCalledWith(-1, -1);
    });

    test("a mousedown on the board hides it; elsewhere leaves it", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setKbCursor({ r: 1, c: 1 }));

        const grid = document.createElement("div");
        grid.setAttribute("role", "grid");
        const cell = document.createElement("div");
        grid.appendChild(cell);
        document.body.appendChild(grid);
        const outside = document.createElement("button");
        document.body.appendChild(outside);

        act(() => {
            outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        });
        expect(state().kbCursor).toEqual({ r: 1, c: 1 });

        act(() => {
            cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        });
        expect(state().kbCursor).toBeNull();
        expect(a.emitCellHover).toHaveBeenCalledWith(-1, -1);
    });
});

describe("guards", () => {
    test("a focused input swallows every key", () => {
        const a = actions();
        render(<Probe {...a} />);
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();

        key("ArrowRight");
        key(" ");

        expect(state().kbCursor).toBeNull();
        expect(a.openCell).not.toHaveBeenCalled();
    });

    /*
     * Closing a dialog (or clicking Reset) parks focus on a button, and no
     * cell is focusable, so a wholesale interactive-focus guard stranded a
     * keyboard-only player with every board key dead. A button only owns
     * Enter/Space; movement takes the keyboard back by blurring it.
     */
    test("a focused button keeps Enter/Space but yields the movement keys", () => {
        const a = actions();
        render(<Probe {...a} />);
        const button = document.createElement("button");
        document.body.appendChild(button);
        button.focus();
        act(() => state().setKbCursor({ r: 1, c: 1 }));

        key(" ");
        expect(a.openCell).not.toHaveBeenCalled(); // Space still means the button

        key("ArrowRight");
        expect(state().kbCursor).toEqual({ r: 1, c: 2 }); // movement got through...
        expect(document.activeElement).not.toBe(button);  // ...and took the keyboard back

        key(" ");
        expect(a.openCell).toHaveBeenCalledWith(1, 2); // so reveal works again
    });

    test("F flags even while a button holds focus", () => {
        const a = actions();
        render(<Probe {...a} />);
        const button = document.createElement("button");
        document.body.appendChild(button);
        button.focus();
        act(() => state().setKbCursor({ r: 0, c: 0 }));

        key("f");

        expect(a.toggleFlag).toHaveBeenCalledWith(0, 0);
    });

    test("an open dialog swallows every key", () => {
        const a = actions();
        render(<Probe {...a} />);
        const dialog = document.createElement("dialog");
        dialog.setAttribute("open", "");
        document.body.appendChild(dialog);

        key("ArrowRight");

        expect(state().kbCursor).toBeNull();
    });

    test("modifier chords pass through untouched", () => {
        const a = actions();
        render(<Probe {...a} />);

        key("ArrowRight", { ctrlKey: true });
        key("d", { metaKey: true });

        expect(state().kbCursor).toBeNull();
    });

    test("the setting turns the whole thing off", () => {
        const a = actions();
        useMinesweeperStore.setState((s) => ({ settings: { ...s.settings, keyboardControls: false } }));
        render(<Probe {...a} />);

        key("ArrowRight");

        expect(state().kbCursor).toBeNull();
    });
});

describe("teardown", () => {
    test("stops listening once the board view is gone", () => {
        const a = actions();
        const { unmount } = render(<Probe {...a} />);
        unmount();

        key("ArrowRight");

        expect(state().kbCursor).toBeNull();
    });
});
