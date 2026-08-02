// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { useChording } from "./useChording";

/**
 * Chording, and the state it has to leave behind.
 *
 * `bothPressed` is a latch: it suppresses the open and the flag that the two
 * buttons would otherwise fire on release. Nothing on screen shows whether it is
 * still set, so both ways of getting it wrong are invisible — clear it too early
 * and the chord's own second release opens a cell, clear it too late (or never)
 * and the next ordinary left-click chords instead.
 *
 * `Cell` only sees a mouse-up that happens over a cell, which is why letting go
 * anywhere else is the case that used to latch it forever.
 */

const Probe = ({ chordCell }: { chordCell: (row: number, col: number) => void }) => {
    useChording(chordCell);
    return null;
};

const state = () => useMinesweeperStore.getState();

/** Puts the store where Cell would after a mousedown on an opened cell. */
const press = ({ left = false, right = false, row = 2, col = 3 } = {}) =>
    act(() => {
        state().setCoord(row, col);
        if (left) state().setLeftClick(true);
        if (right) state().setRightClick(true);
    });

/** A real mouse-up on the window, with the buttons STILL held after it. */
const releaseOnWindow = (buttonsStillHeld: number) =>
    act(() => {
        window.dispatchEvent(new MouseEvent("mouseup", { buttons: buttonsStillHeld }));
    });

beforeEach(() => {
    act(() => {
        state().setLeftClick(false);
        state().setRightClick(false);
        state().setBothPressed(false);
        state().setCoord(-1, -1);
    });
});

describe("firing the chord", () => {
    test("both buttons down on a cell chords it, and latches the suppression", () => {
        const chordCell = vi.fn();
        render(<Probe chordCell={chordCell} />);

        press({ left: true, right: true });

        expect(chordCell).toHaveBeenCalledWith(2, 3);
        expect(state().bothPressed).toBe(true);
    });

    test("one button alone does not chord", () => {
        const chordCell = vi.fn();
        render(<Probe chordCell={chordCell} />);

        press({ left: true });

        expect(chordCell).not.toHaveBeenCalled();
        expect(state().bothPressed).toBe(false);
    });
});

describe("letting go somewhere that is not a cell", () => {
    test("clears the buttons, so the next click does not chord on its own", () => {
        const chordCell = vi.fn();
        render(<Probe chordCell={chordCell} />);
        press({ left: true, right: true });
        chordCell.mockClear();

        // Dragged off the board and released: no cell handler ever runs.
        releaseOnWindow(0);

        expect(state().leftClick).toBe(false);
        expect(state().rightClick).toBe(false);
        expect(state().bothPressed).toBe(false);

        // The proof it is really unlatched: pressing one button now does
        // nothing, where a stuck pair would have chorded immediately.
        press({ left: true, row: 5, col: 5 });
        expect(chordCell).not.toHaveBeenCalled();
    });

    test("alt-tabbing away clears them too", () => {
        render(<Probe chordCell={vi.fn()} />);
        press({ left: true, right: true });

        act(() => {
            window.dispatchEvent(new Event("blur"));
        });

        expect(state().leftClick).toBe(false);
        expect(state().rightClick).toBe(false);
    });

    /*
     * The reason this listens on `buttons` rather than clearing on every
     * mouse-up. A chord ends in TWO releases, and the suppression has to survive
     * the first one — otherwise the second release fires the open or flag that
     * chording exists to swallow.
     */
    test("keeps the latch while the other button is still down", () => {
        render(<Probe chordCell={vi.fn()} />);
        press({ left: true, right: true });

        releaseOnWindow(1); // left still held

        expect(state().bothPressed).toBe(true);
    });
});

describe("teardown", () => {
    test("stops listening once the board is gone", () => {
        const { unmount } = render(<Probe chordCell={vi.fn()} />);
        unmount();

        press({ left: true, right: true });
        releaseOnWindow(0);

        // Nothing cleared it, because nothing is listening any more.
        expect(state().leftClick).toBe(true);
    });
});

describe("with chording disabled in settings", () => {
    test("both buttons fire no chord, but still latch bothPressed", () => {
        useMinesweeperStore.setState((s) => ({
            settings: { ...s.settings, chording: false },
        }));
        const chordCell = vi.fn();
        render(<Probe chordCell={chordCell} />);

        press({ left: true });
        press({ right: true });

        expect(chordCell).not.toHaveBeenCalled();
        // The latch still guards the releases: without it, letting go would
        // fire the open AND the flag the two buttons mean on their own.
        expect(state().bothPressed).toBe(true);

        useMinesweeperStore.setState((s) => ({
            settings: { ...s.settings, chording: true },
        }));
    });
});
