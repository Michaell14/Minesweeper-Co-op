// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import type { Cell } from "@/state/types";
import { useKeyboardControls, type KeyboardActions } from "./useKeyboardControls";

/**
 * Keyboard play: seed the store, dispatch a real KeyboardEvent on the window,
 * assert on the action mocks and kbCursor.
 */

const closed = (): Cell => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 });
const open = (nearbyMines: number): Cell => ({ isMine: false, isOpen: true, isFlagged: false, nearbyMines });
const flagged = (): Cell => ({ isMine: false, isOpen: false, isFlagged: true, nearbyMines: 0 });

/** 3x3 all closed; the cursor first shows at the centre (1,1). */
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
    pingCell: vi.fn(),
});

const Probe = (props: KeyboardActions) => {
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
        state().setPingArmed(false);
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

describe("pinging with P", () => {
    /*
     * A plain key: the handler drops Ctrl/Meta/Alt keystrokes, and Shift is
     * the mouse shortcut. No arming step; the cursor already says which cell.
     */
    test("points at the cell under the cursor", () => {
        const props = actions();
        render(<Probe {...props} />);
        key("ArrowRight");   // shows the cursor at the centre

        key("p");

        expect(props.pingCell).toHaveBeenCalledWith(1, 1);
    });

    test("does nothing with no cursor on the board", () => {
        const props = actions();
        render(<Probe {...props} />);

        key("p");

        expect(props.pingCell).not.toHaveBeenCalled();
    });

    // A ping is a move hint on a shared board; refused server-side anyway.
    test("is inert in PVP", () => {
        const props = actions();
        render(<Probe {...props} />);
        key("ArrowRight");
        act(() => {
            state().setMode("pvp");
            state().setPvpStarted(true);
        });

        key("p");

        expect(props.pingCell).not.toHaveBeenCalled();
    });

    // The daily passes no handler: nobody to point at.
    test("does nothing where no ping action was given", () => {
        const props = actions();
        const { pingCell, ...withoutPing } = props;
        render(<Probe {...withoutPing} />);
        key("ArrowRight");

        key("p");

        expect(pingCell).not.toHaveBeenCalled();
    });

    test("auto-repeat does not machine-gun the room", () => {
        const props = actions();
        render(<Probe {...props} />);
        key("ArrowRight");

        key("p");
        key("p", { repeat: true });

        expect(props.pingCell).toHaveBeenCalledTimes(1);
    });

    // P is a letter, so it must not interrupt typing.
    test("does not fire while a text field has focus", () => {
        const props = actions();
        render(<Probe {...props} />);
        key("ArrowRight");
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();

        key("p");

        expect(props.pingCell).not.toHaveBeenCalled();
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
    test("Escape cancels an armed ping even without a keyboard cursor", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setPingArmed(true));

        key("Escape");

        expect(state().pingArmed).toBe(false);
        expect(a.pingCell).not.toHaveBeenCalled();
        expect(a.emitCellHover).not.toHaveBeenCalled();
    });

    test("Escape still cancels a pointer-armed ping when keyboard play is disabled", () => {
        render(<Probe {...actions()} />);
        act(() => {
            state().setPingArmed(true);
            useMinesweeperStore.setState((s) => ({ settings: { ...s.settings, keyboardControls: false } }));
        });

        key("Escape");

        expect(state().pingArmed).toBe(false);
    });

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
     * Closing a dialog parks focus on a button, so a wholesale focus guard
     * stranded keyboard players. A button owns only Enter/Space; movement blurs it.
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
        expect(state().kbCursor).toEqual({ r: 1, c: 2 }); // movement got through
        expect(document.activeElement).not.toBe(button);  // and took the keyboard back

        key(" ");
        expect(a.openCell).toHaveBeenCalledWith(1, 2);
    });

    test("the HUD switch (a checkbox) yields like a button, not like an input", () => {
        const a = actions();
        render(<Probe {...a} />);
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        document.body.appendChild(toggle);
        toggle.focus();
        act(() => state().setKbCursor({ r: 1, c: 1 }));

        key(" ");
        expect(a.openCell).not.toHaveBeenCalled(); // Space still toggles the switch

        key("ArrowRight");
        expect(state().kbCursor).toEqual({ r: 1, c: 2 });
        expect(document.activeElement).not.toBe(toggle);

        key(" ");
        expect(a.openCell).toHaveBeenCalledWith(1, 2);
    });

    test("a radio keeps its arrow keys — they navigate its group", () => {
        const a = actions();
        render(<Probe {...a} />);
        const radio = document.createElement("input");
        radio.type = "radio";
        document.body.appendChild(radio);
        radio.focus();

        key("ArrowRight");

        expect(state().kbCursor).toBeNull();
        expect(document.activeElement).toBe(radio);
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

describe("Space under the mouse", () => {
    /**
     * A cell at (r, c) under the mouse. jsdom has no hit testing, so
     * elementFromPoint is stubbed to return the cell's inner hit area — the
     * element a real hit lands on.
     */
    const hoverCell = (r: number, c: number) => {
        const grid = document.createElement("div");
        grid.setAttribute("role", "grid");
        const cell = document.createElement("div");
        cell.setAttribute("role", "gridcell");
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        const hitArea = document.createElement("div");
        cell.appendChild(hitArea);
        grid.appendChild(cell);
        document.body.appendChild(grid);
        document.elementFromPoint = vi.fn(() => hitArea);
    };

    /** jsdom has no PointerEvent; a MouseEvent carrying pointerType is all the hook reads. */
    const pointerMove = (x: number, y: number, pointerType = "mouse") =>
        act(() => {
            const event = new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true });
            Object.defineProperty(event, "pointerType", { value: pointerType });
            window.dispatchEvent(event);
        });

    /** `key`, returning the event so a test can ask whether the page would have scrolled. */
    const press = (k: string, init: KeyboardEventInit = {}) => {
        const event = new KeyboardEvent("keydown", { key: k, cancelable: true, ...init });
        act(() => {
            window.dispatchEvent(event);
        });
        return event;
    };

    afterEach(() => {
        delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    });

    test("flags the covered cell under the mouse, hit-tested where the mouse is", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 2);
        pointerMove(30, 40);

        const event = press(" ");

        expect(a.toggleFlag).toHaveBeenCalledWith(0, 2);
        expect(a.openCell).not.toHaveBeenCalled();
        expect(document.elementFromPoint).toHaveBeenCalledWith(30, 40);
        expect(event.defaultPrevented).toBe(true); // and the page does not scroll
    });

    test("lifts a flag the same way", () => {
        const a = actions();
        const board = closedBoard();
        board[1][1] = flagged();
        render(<Probe {...a} />);
        act(() => state().setBoard(board));
        hoverCell(1, 1);
        pointerMove(5, 5);

        press(" ");

        expect(a.toggleFlag).toHaveBeenCalledWith(1, 1);
    });

    test("chords a revealed number, and leaves it alone with chording off", () => {
        const a = actions();
        const board = closedBoard();
        board[1][1] = open(2);
        render(<Probe {...a} />);
        act(() => state().setBoard(board));
        hoverCell(1, 1);
        pointerMove(5, 5);

        press(" ");
        expect(a.chordCell).toHaveBeenCalledWith(1, 1);
        expect(a.toggleFlag).not.toHaveBeenCalled();

        useMinesweeperStore.setState((s) => ({ settings: { ...s.settings, chording: false } }));
        press(" ");
        expect(a.chordCell).toHaveBeenCalledTimes(1);
    });

    test("an open blank does nothing, but Space still does not scroll the board away", () => {
        const a = actions();
        const board = closedBoard();
        board[1][1] = open(0);
        render(<Probe {...a} />);
        act(() => state().setBoard(board));
        hoverCell(1, 1);
        pointerMove(5, 5);

        const event = press(" ");

        expect(a.chordCell).not.toHaveBeenCalled();
        expect(a.toggleFlag).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
    });

    test("a held Space flags once instead of flickering the flag", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 0);
        pointerMove(5, 5);

        press(" ");
        press(" ", { repeat: true });
        press(" ", { repeat: true });

        expect(a.toggleFlag).toHaveBeenCalledTimes(1);
    });

    test("is its own setting: off here, and still on with keyboard controls off", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 0);
        pointerMove(5, 5);

        useMinesweeperStore.setState((s) => ({ settings: { ...s.settings, spaceToFlag: false } }));
        const off = press(" ");
        expect(a.toggleFlag).not.toHaveBeenCalled();
        expect(off.defaultPrevented).toBe(false);

        useMinesweeperStore.setState((s) => ({ settings: { ...s.settings, spaceToFlag: true, keyboardControls: false } }));
        press(" ");
        expect(a.toggleFlag).toHaveBeenCalledWith(0, 0);
    });

    /* A keyboard player's mouse often rests on the board. */
    test("the keyboard cursor keeps Space while the mouse stays put", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 0);
        pointerMove(5, 5);

        key("ArrowRight");     // shows the cursor at the centre
        pointerMove(5, 5);     // a move event to the same point is not a move
        key(" ");

        expect(a.openCell).toHaveBeenCalledWith(1, 1);
        expect(a.toggleFlag).not.toHaveBeenCalled();
    });

    /* The reverse: a cursor left on the board must not reveal a cell the mouse is not on. */
    test("moving the mouse takes Space back and retires the keyboard cursor", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 0);
        key("ArrowRight");
        expect(state().kbCursor).toEqual({ r: 1, c: 1 });

        pointerMove(5, 5);
        key(" ");

        expect(a.toggleFlag).toHaveBeenCalledWith(0, 0);
        expect(a.openCell).not.toHaveBeenCalled();
        expect(state().kbCursor).toBeNull();
        expect(a.emitCellHover).toHaveBeenLastCalledWith(0, 0);
    });

    test("a button reached with Tab keeps Space, wherever the mouse rests", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 0);
        pointerMove(5, 5);
        const button = document.createElement("button");
        document.body.appendChild(button);
        button.focus();

        key("Tab");
        const event = press(" ");

        expect(a.toggleFlag).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(button);
    });

    /* Clicking Reset Board leaves it focused; Space on the board must not reset again. */
    test("a button the mouse clicked earlier gives Space up once the mouse is on the board", () => {
        const a = actions();
        render(<Probe {...a} />);
        const button = document.createElement("button");
        document.body.appendChild(button);
        button.focus();
        hoverCell(0, 0);
        pointerMove(5, 5);

        const event = press(" ");

        expect(a.toggleFlag).toHaveBeenCalledWith(0, 0);
        expect(event.defaultPrevented).toBe(true);
        expect(document.activeElement).not.toBe(button);
    });

    test("a touch is not a hover", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 0);
        pointerMove(5, 5, "touch");

        press(" ");

        expect(a.toggleFlag).not.toHaveBeenCalled();
    });

    test("the mouse leaving the window lets go of Space", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 0);
        pointerMove(5, 5);
        act(() => {
            window.dispatchEvent(new MouseEvent("pointerout", { relatedTarget: null, bubbles: true }));
        });

        press(" ");

        expect(a.toggleFlag).not.toHaveBeenCalled();
    });

    /*
     * A miss is the reported bug: about an eighth of the board is the gap
     * between cells, and Space there used to scroll the board away.
     */
    describe("a press that misses every cell", () => {
        /** Where the hit lands instead: a row (the gap between two cells), or off the board. */
        const missOnto = (where: "gap" | "page") => {
            const grid = document.createElement("div");
            grid.setAttribute("role", "grid");
            const row = document.createElement("div");
            row.setAttribute("role", "row");
            grid.appendChild(row);
            document.body.appendChild(grid);
            document.elementFromPoint = vi.fn(() => (where === "gap" ? row : document.body));
        };

        test.each(["gap", "page"] as const)("onto the %s does nothing and does not scroll", (where) => {
            const a = actions();
            render(<Probe {...a} />);
            missOnto(where);
            pointerMove(5, 5);

            const event = press(" ");

            expect(event.defaultPrevented).toBe(true);
            expect(a.toggleFlag).not.toHaveBeenCalled();
            expect(a.chordCell).not.toHaveBeenCalled();
        });

        test("does not reveal under a keyboard cursor left on the board", () => {
            const a = actions();
            render(<Probe {...a} />);
            key("ArrowRight");     // the cursor shows at (1,1)
            missOnto("page");
            pointerMove(5, 5);

            press(" ");

            expect(a.openCell).not.toHaveBeenCalled();
            expect(state().kbCursor).toEqual({ r: 1, c: 1 });
        });

        test("does not press a button the mouse clicked earlier", () => {
            const a = actions();
            render(<Probe {...a} />);
            const button = document.createElement("button");
            document.body.appendChild(button);
            button.focus();
            missOnto("page");
            pointerMove(5, 5);

            const event = press(" ");

            expect(event.defaultPrevented).toBe(true);
            expect(document.activeElement).not.toBe(button);
        });

        test("is the page's again once there is no board to play", () => {
            render(<Probe {...actions()} />);
            act(() => state().setBoard([]));
            missOnto("page");
            pointerMove(5, 5);

            expect(press(" ").defaultPrevented).toBe(false);
        });
    });

    test("waits for the race to start in PVP", () => {
        const a = actions();
        render(<Probe {...a} />);
        act(() => state().setMode("pvp"));
        hoverCell(0, 0);
        pointerMove(5, 5);

        press(" ");
        expect(a.toggleFlag).not.toHaveBeenCalled();

        act(() => state().setPvpStarted(true));
        press(" ");
        expect(a.toggleFlag).toHaveBeenCalledWith(0, 0);
    });

    test("a text field keeps its spaces", () => {
        const a = actions();
        render(<Probe {...a} />);
        hoverCell(0, 0);
        pointerMove(5, 5);
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();

        press(" ");

        expect(a.toggleFlag).not.toHaveBeenCalled();
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
