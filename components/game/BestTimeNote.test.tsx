// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { boardKey, clearBestTimes, recordBestTime } from "@/lib/bestTimes";
import type { BestTimeResult } from "@/state/gameSlice";
import BestTimeNote from "./BestTimeNote";

/**
 * What the summary says about your record.
 *
 * Two failures worth guarding, both of which look like a working feature.
 *
 * Congratulating someone for nothing: the celebration keys off
 * `bestTimeResult`, which is set ONLY when a board is actually cleared, so a
 * loss and a win handed over by an opponent's disconnect must both leave it
 * silent.
 *
 * And hiding the record when it is most wanted: the standing time shows
 * whatever the outcome was. An earlier version only rendered it after a clear
 * that failed to improve, which meant the number a player is chasing was
 * invisible in almost every game that actually ended.
 */

const BOARD = { rows: 16, cols: 16, mines: 40 };

const setResult = (result: BestTimeResult | null) =>
    useMinesweeperStore.getState().setBestTimeResult(result);

beforeEach(() => {
    useMinesweeperStore.getState().setDimensions(BOARD.rows, BOARD.cols, BOARD.mines);
});

afterEach(() => {
    setResult(null);
    clearBestTimes();
});

const withRecord = (seconds: number, players = 1) =>
    recordBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines), { seconds, players, at: 1 });

describe("a board with no record yet", () => {
    test("says nothing at all", async () => {
        const { container } = render(<BestTimeNote />);

        await waitFor(() => expect(container.textContent).toBe(""));
    });
});

describe("a run that did not finish the board", () => {
    /* A loss, or a win by an opponent's disconnect: no result is ever set. */
    test("does not congratulate you", async () => {
        withRecord(90);
        setResult(null);
        render(<BestTimeNote />);

        await waitFor(() =>
            expect(screen.getByRole("status").textContent).not.toContain("New best"));
    });

    /* The point of the refactor: losing is when you want to see the target. */
    test("still shows the record you were chasing", async () => {
        withRecord(90);
        setResult(null);
        render(<BestTimeNote />);

        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Best 01:30"));
    });
});

describe("a first clear", () => {
    test("celebrates, with nothing to compare against", async () => {
        setResult({ improved: true, previous: null });
        render(<BestTimeNote />);

        const text = screen.getByRole("status").textContent ?? "";
        expect(text).toContain("New best!");
        expect(text).not.toContain("Beat");
    });
});

describe("beating your record", () => {
    test("says what it beat, so the improvement is legible", () => {
        setResult({ improved: true, previous: { seconds: 125, players: 1, at: 1 } });
        render(<BestTimeNote />);

        const text = screen.getByRole("status").textContent ?? "";
        expect(text).toContain("New best!");
        expect(text).toContain("02:05");
    });
});

describe("clearing it but falling short", () => {
    test("shows the record still standing", async () => {
        withRecord(90);
        setResult({ improved: false, previous: { seconds: 90, players: 1, at: 1 } });
        render(<BestTimeNote />);

        await waitFor(() => {
            const text = screen.getByRole("status").textContent ?? "";
            expect(text).toContain("Best 01:30");
            expect(text).not.toContain("New best!");
        });
    });

    /*
     * The player count is what stops the number lying. A time set by four
     * people is a real result but not the same one, and a record that hides
     * that stops being worth chasing.
     */
    test("says when the record took more than one player", async () => {
        withRecord(90, 3);
        setResult({ improved: false, previous: { seconds: 90, players: 3, at: 1 } });
        render(<BestTimeNote />);

        await waitFor(() => expect(screen.getByRole("status").textContent).toContain("3 players"));
    });

    test("stays quiet about it for a solo record", async () => {
        withRecord(90, 1);
        setResult({ improved: false, previous: { seconds: 90, players: 1, at: 1 } });
        render(<BestTimeNote />);

        await waitFor(() =>
            expect(screen.getByRole("status").textContent).not.toContain("players"));
    });
});
