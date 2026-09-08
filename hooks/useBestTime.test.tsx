// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { boardKey, clearBestTimes, recordBestTime, type BestTime } from "@/lib/bestTimes";
import { useBestTime } from "./useBestTime";

/**
 * Which store the in-game record comes from. Wrong in either direction is
 * silent: signed in on a new device the banner read an empty browser, and a
 * stale account copy after signing out shows someone else's number. The hook
 * renders nothing, so the probe prints what it was handed.
 */

const Probe = () => {
    const { best, label } = useBestTime();
    return <p>{best ? `${label}: ${best.seconds}` : `${label}: none`}</p>;
};

const state = () => useMinesweeperStore.getState();
const select = (rows: number, cols: number, mines: number) => state().setDimensions(rows, cols, mines);

const shown = (text: string) => waitFor(() => expect(screen.getByText(text)).toBeTruthy());

const account = (bests: Record<string, BestTime>) => state().setAccountBests(bests);

afterEach(() => {
    clearBestTimes();
    state().setAccountBests(null);
    state().setPlayerStatsInRoom([]);
    select(16, 16, 40);
});

describe("signed out", () => {
    test("reads this browser's record", async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 1 });
        select(9, 9, 10);

        render(<Probe />);

        await shown("Small / Easy: 95");
    });

    test("a board this browser has never cleared has no record", async () => {
        select(9, 9, 10);
        render(<Probe />);
        await shown("Small / Easy: none");
    });
});

describe("signed in", () => {
    /* The bug this change fixes, in one test. */
    test("shows the account's record even where the browser has none", async () => {
        account({ "9x9/10": { seconds: 42, players: 1, at: 1 } });
        select(9, 9, 10);

        render(<Probe />);

        await shown("Small / Easy: 42");
    });

    test("the account wins over a browser record left behind on this machine", async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 1 });
        account({ "9x9/10": { seconds: 42, players: 1, at: 1 } });
        select(9, 9, 10);

        render(<Probe />);

        await shown("Small / Easy: 42");
    });

    /*
     * A board the ACCOUNT has no record for shows none rather than falling
     * back per-board to this machine; mixing the two makes a record appear on
     * one device and not another.
     */
    test("a board the account has never cleared shows nothing, browser copy or not", async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 1 });
        account({ "16x16/40": { seconds: 300, players: 1, at: 1 } });
        select(9, 9, 10);

        render(<Probe />);

        await shown("Small / Easy: none");
    });

    test("the group's record and the solo one stay different records", async () => {
        account({
            "9x9/10": { seconds: 95, players: 1, at: 1 },
            "9x9/10@3": { seconds: 40, players: 3, at: 1 },
        });
        select(9, 9, 10);

        const { rerender } = render(<Probe />);
        await shown("Small / Easy: 95");

        // Two more players join: the same board, a different result.
        state().setPlayerStatsInRoom([
            { name: "A", score: 0 },
            { name: "B", score: 0 },
            { name: "C", score: 0 },
        ]);
        rerender(<Probe />);

        await shown("Small / Easy: 40");
    });

    /* Stats being down must not blank a number that was right a second ago. */
    test("falls back to this browser when the account's records cannot be fetched", async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 1 });
        state().setAccountBests(null);
        select(9, 9, 10);

        render(<Probe />);

        await shown("Small / Easy: 95");
    });
});

describe("switching boards", () => {
    test("stops showing the previous board's account record", async () => {
        account({
            "9x9/10": { seconds: 42, players: 1, at: 1 },
            "16x16/40": { seconds: 300, players: 1, at: 1 },
        });
        select(9, 9, 10);

        const { rerender } = render(<Probe />);
        await shown("Small / Easy: 42");

        select(16, 16, 40);
        rerender(<Probe />);

        await shown("Medium / Medium: 300");
    });

    test("records arriving after mount replace what the browser showed", async () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 95, players: 1, at: 1 });
        select(9, 9, 10);

        const { rerender } = render(<Probe />);
        await shown("Small / Easy: 95");

        // Sign-in resolves after mount — BestsSync fetches, then this lands.
        account({ "9x9/10": { seconds: 42, players: 1, at: 1 } });
        rerender(<Probe />);

        await shown("Small / Easy: 42");
    });
});
