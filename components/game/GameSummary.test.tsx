// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { DEFAULT_PRESET } from "@/shared/boardConfig";
import type { Cell } from "@/shared/socketPayloads";
import GameSummary from "./GameSummary";

/**
 * What a finished game says it amounted to.
 *
 * Every number here is DERIVED — from the board still in state and the scores
 * already on screen — rather than sent. That is the right design, and it is also
 * why the numbers can quietly go wrong: nothing fails, the summary just reports
 * something that is not true, at the one moment a player is reading it closely.
 *
 * The two modes deliberately read differently. Co-op ends on the shared
 * scoreboard; a race ends on how far each player got, and the score table is
 * hidden in PVP everywhere else. Showing the wrong one is invisible to types.
 */

/**
 * A 10x10 board with a single mine at (0,0) and `opened` safe cells revealed —
 * so 99 safe cells, and the percentages below are readable by eye.
 */
const MINES = 1;
const SAFE_CELLS = 99;

const board = (opened: number): Cell[][] => {
    let remaining = opened;
    return Array.from({ length: 10 }, (_, r) =>
        Array.from({ length: 10 }, (_, c): Cell => {
            const isMine = r === 0 && c === 0;
            const isOpen = !isMine && remaining > 0;
            if (isOpen) remaining--;
            return { isMine, isOpen, isFlagged: false, nearbyMines: 0 };
        }),
    );
};

const arrange = ({
    mode = "co-op" as "co-op" | "pvp",
    opened = 0,
    startedAt = null as number | null,
    endedAt = null as number | null,
    opponentName = "",
    opponentProgress = 0,
    totalSafeCells = 0,
} = {}) => {
    const store = useMinesweeperStore.getState();
    store.setMode(mode);
    store.setBoard(board(opened));
    store.setDimensions(10, 10, MINES);
    store.setClock({ startedAt, endedAt });
    store.setPvpOpponentName(opponentName);
    store.setPvpOpponentProgress(opponentProgress);
    store.setPvpTotalSafeCells(totalSafeCells);
};

afterEach(() => {
    const store = useMinesweeperStore.getState();
    store.setBoard([]);
    store.setMode("co-op");
    store.setDimensions(DEFAULT_PRESET.rows, DEFAULT_PRESET.cols, DEFAULT_PRESET.mines);
    store.setClock({ startedAt: null, endedAt: null });
    store.setPlayerStatsInRoom([]);
    store.setPvpOpponentName("");
    store.setPvpOpponentProgress(0);
    store.setPvpTotalSafeCells(0);
});

describe("the time", () => {
    test("reports how long the run took", () => {
        arrange({ startedAt: 1_000, endedAt: 68_000 });
        render(<GameSummary />);

        expect(screen.getByText("Time")).toBeDefined();
        expect(screen.getByText("01:07")).toBeDefined();
    });

    /*
     * A run with no recorded finish has no duration to report. Showing 00:00
     * would read as "you finished instantly" rather than "unknown".
     */
    test("is left out entirely when the clock never stopped", () => {
        arrange({ startedAt: 1_000, endedAt: null });
        render(<GameSummary />);

        expect(screen.queryByText("Time")).toBeNull();
    });

    test("is left out when the clock never started either", () => {
        arrange();
        render(<GameSummary />);

        expect(screen.queryByText("Time")).toBeNull();
    });
});

describe("co-op", () => {
    test("reports the share of the board that fell", () => {
        // 100 cells, 1 mine -> 99 safe; 33 opened is 33%.
        arrange({ opened: 33 });
        render(<GameSummary />);

        expect(screen.getByText("Cleared")).toBeDefined();
        expect(screen.getByText("33%")).toBeDefined();
    });

    test("reports the raw count alongside it", () => {
        arrange({ opened: 33 });
        render(<GameSummary />);

        expect(screen.getByText(`33/${SAFE_CELLS}`)).toBeDefined();
    });

    test("a cleared board reads as 100%", () => {
        arrange({ opened: SAFE_CELLS });
        render(<GameSummary />);

        expect(screen.getByText("100%")).toBeDefined();
    });

    /* An empty board must not divide by zero and report NaN%. */
    test("an empty board reports zero rather than nonsense", () => {
        const store = useMinesweeperStore.getState();
        store.setMode("co-op");
        store.setBoard([]);
        store.setDimensions(10, 10, 10);
        store.setClock({ startedAt: null, endedAt: null });
        render(<GameSummary />);

        expect(screen.getByText("0%")).toBeDefined();
        expect(screen.getByText("0/0")).toBeDefined();
    });

    test("ends on the scoreboard, because the result is shared", () => {
        arrange({ opened: 10 });
        useMinesweeperStore.getState().setPlayerStatsInRoom([
            { name: "Alice", score: 7 },
            { name: "Bob", score: 3 },
        ]);
        render(<GameSummary />);

        expect(screen.getByRole("table", { name: /leaderboard/i })).toBeDefined();
        expect(screen.getByText("Alice")).toBeDefined();
    });
});

describe("PVP", () => {
    const race = () =>
        arrange({
            mode: "pvp",
            opened: 40,
            opponentName: "Rival",
            opponentProgress: 60,
            totalSafeCells: SAFE_CELLS,
        });

    test("ends on the head-to-head, not the scoreboard", () => {
        race();
        useMinesweeperStore.getState().setPlayerStatsInRoom([{ name: "Alice", score: 7 }]);
        render(<GameSummary />);

        expect(screen.queryByRole("table")).toBeNull();
    });

    test("names the opponent it is comparing you against", () => {
        race();
        render(<GameSummary />);

        expect(screen.getByText("Rival")).toBeDefined();
        expect(screen.getByText("You")).toBeDefined();
    });

    test("reports both sides of the race", () => {
        race();
        render(<GameSummary />);

        expect(screen.getByText("40%")).toBeDefined(); // 40 of 99 safe cells
        expect(screen.getByText("61%")).toBeDefined(); // 60 of 99, rounded
    });

    /* A disconnect can end a race before a name ever arrived. */
    test("falls back to a generic label when the opponent is unnamed", () => {
        arrange({ mode: "pvp", opened: 5, totalSafeCells: SAFE_CELLS });
        render(<GameSummary />);

        expect(screen.getByText("Opponent")).toBeDefined();
    });
});
