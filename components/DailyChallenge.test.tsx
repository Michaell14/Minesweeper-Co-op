// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import DailyChallenge from "./DailyChallenge";

/**
 * Chording on the daily board.
 *
 * `Cell` records which buttons are down whatever the mode, but the hook that
 * READS that state was mounted by Grid alone. So two-button chording did
 * nothing here — no error, no clue, just a move the game quietly did not make —
 * and the button state Cell had recorded was left set, so the first chord in a
 * room opened afterwards fired on a cell nobody had pressed twice.
 *
 * Rendered with an empty board on purpose: `useChording` is called before the
 * has-a-board branch, so this exercises the wiring without mounting Board, whose
 * CursorLayer wants a ResizeObserver jsdom does not have.
 */

const props = (dailyChordCell: (row: number, col: number) => void) => ({
    leaveDaily: vi.fn(),
    dailyOpenCell: vi.fn(),
    dailyChordCell,
    dailyToggleFlag: vi.fn(),
    getDailyLeaderboard: vi.fn(),
});

const state = () => useMinesweeperStore.getState();

beforeEach(() => {
    act(() => {
        state().setBoard([]);
        state().setDailyStatus("in_progress");
        state().setLeftClick(false);
        state().setRightClick(false);
        state().setBothPressed(false);
        state().setCoord(-1, -1);
    });
});

afterEach(() => {
    act(() => {
        state().setLeftClick(false);
        state().setRightClick(false);
        state().setBothPressed(false);
    });
});

describe("the daily view", () => {
    test("chords when both buttons go down on a cell", () => {
        const dailyChordCell = vi.fn();
        render(<DailyChallenge {...props(dailyChordCell)} />);

        act(() => {
            state().setCoord(4, 7);
            state().setLeftClick(true);
            state().setRightClick(true);
        });

        expect(dailyChordCell).toHaveBeenCalledWith(4, 7);
    });

    test("clears the button state when a release lands off the board", () => {
        render(<DailyChallenge {...props(vi.fn())} />);

        act(() => {
            state().setCoord(4, 7);
            state().setLeftClick(true);
            state().setRightClick(true);
        });
        act(() => {
            window.dispatchEvent(new MouseEvent("mouseup", { buttons: 0 }));
        });

        // Left set, this leaked into the next room the player opened.
        expect(state().leftClick).toBe(false);
        expect(state().rightClick).toBe(false);
        expect(state().bothPressed).toBe(false);
    });
});

/**
 * The view-only strip under a settled board — the replay's caption. It keeps
 * submit/leaderboard reachable after their dialog is dismissed, and must NOT
 * appear mid-game.
 */
describe("the replay strip", () => {
    const CELL = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 0 };

    beforeEach(() => {
        // Board mounts CursorLayer, which measures with a ResizeObserver
        // jsdom does not ship.
        vi.stubGlobal("ResizeObserver", class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
        act(() => state().setBoard([[CELL]]));
    });

    afterEach(() => vi.unstubAllGlobals());

    test("a failed replay says view-only and offers the leaderboard", () => {
        act(() => state().setDailyStatus("failed"));
        const p = props(vi.fn());
        const { getByText, getByRole } = render(<DailyChallenge {...p} />);

        expect(getByText(/view-only/i)).toBeTruthy();
        getByRole("button", { name: "View today's leaderboard" }).click();
        expect(p.getDailyLeaderboard).toHaveBeenCalled();
    });

    test("an unsubmitted win offers the submit dialog instead", () => {
        act(() => state().setDailyStatus("won_pending_submit"));
        const { getByRole, queryByRole } = render(<DailyChallenge {...props(vi.fn())} />);

        expect(getByRole("button", { name: "Submit your time to the leaderboard" })).toBeTruthy();
        expect(queryByRole("button", { name: "View today's leaderboard" })).toBeNull();
    });

    test("mid-game there is no strip — the board is live, not a replay", () => {
        act(() => state().setDailyStatus("in_progress"));
        const { queryByText } = render(<DailyChallenge {...props(vi.fn())} />);
        expect(queryByText(/view-only/i)).toBeNull();
    });
});
