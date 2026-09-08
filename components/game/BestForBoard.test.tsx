// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { boardKey, clearBestTimes, recordBestTime } from "@/lib/bestTimes";
import BestForBoard from "./BestForBoard";

/**
 * The record shown on the landing page. Both interesting cases are about NOT
 * showing something: an uncleared board has no record, and switching difficulty
 * must drop the previous board's time, which would otherwise read as a real one.
 */

const select = (rows: number, cols: number, mines: number) =>
    useMinesweeperStore.getState().setDimensions(rows, cols, mines);

afterEach(() => {
    clearBestTimes();
    select(16, 16, 40);
    useMinesweeperStore.getState().setPlayerStatsInRoom([]);
});

describe("a board never cleared", () => {
    test("shows nothing rather than a placeholder time", async () => {
        select(9, 9, 10);
        const { container } = render(<BestForBoard />);

        await waitFor(() => expect(container.textContent).toBe(""));
    });
});

describe("a board with a record", () => {
    test("shows the time and names the board", async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 1 });
        select(9, 9, 10);
        render(<BestForBoard />);

        await waitFor(() => {
            const text = screen.getByRole("status").textContent ?? "";
            expect(text).toContain("01:35");
            expect(text).toContain("Small / Easy");
        });
    });

    test("names a custom board by its shape, since it has no preset", async () => {
        recordBestTime(boardKey(12, 11, 17), { seconds: 60, players: 1, at: 1 });
        select(12, 11, 17);
        render(<BestForBoard />);

        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toContain("12x11, 17 mines"));
    });

    /*
     * Nobody has joined yet, so the target must be one you could match alone;
     * a group's time on the same board is faster by construction.
     */
    test("offers the solo record, not a faster one a group set", async () => {
        recordBestTime(boardKey(9, 9, 10, 1), { seconds: 95, players: 1, at: 1 });
        recordBestTime(boardKey(9, 9, 10, 3), { seconds: 40, players: 3, at: 1 });
        select(9, 9, 10);
        render(<BestForBoard />);

        await waitFor(() =>
            expect(screen.getByRole("status").textContent).toContain("01:35"));
        expect(screen.getByRole("status").textContent).not.toContain("00:40");
    });
});

describe("changing the selection", () => {
    /* The quiet one: a stale time is attributed to a board it was never set on. */
    test("drops a record that belongs to the board you just left", async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 1 });
        select(9, 9, 10);
        const { container } = render(<BestForBoard />);
        await waitFor(() => expect(container.textContent).toContain("01:35"));

        select(9, 9, 17); // same size, harder

        await waitFor(() => expect(container.textContent).toBe(""));
    });

    test("picks up the record for the board you moved to", async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 1 });
        recordBestTime(boardKey(16, 16, 40), { seconds: 300, players: 1, at: 1 });
        select(9, 9, 10);
        const { container } = render(<BestForBoard />);
        await waitFor(() => expect(container.textContent).toContain("01:35"));

        select(16, 16, 40);

        await waitFor(() => expect(container.textContent).toContain("05:00"));
    });
});
