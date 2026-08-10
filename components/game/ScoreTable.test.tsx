// @vitest-environment jsdom
/**
 * The co-op score table's avatar column. The failure mode is silent — a
 * dropped avatar just renders every row name-only — so the assertion is on
 * what each ROW actually contains, signed-in and anonymous side by side.
 */
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import ScoreTable from "./ScoreTable";

afterEach(() => {
    cleanup();
    useMinesweeperStore.getState().setPlayerStatsInRoom([]);
});

test("a signed-in row carries its avatar; an anonymous row is name-only", () => {
    useMinesweeperStore.getState().setPlayerStatsInRoom([
        { name: "Miguel", avatar: "fox", score: 12 },
        { name: "Guest", avatar: null, score: 8 },
        // A payload from a pre-avatar server lacks the field entirely.
        { name: "Oldtimer", score: 3 },
    ]);
    render(<ScoreTable />);

    const rows = screen.getAllByRole("row").slice(1); // drop the header
    expect(rows[0].textContent).toContain("Miguel");
    expect(rows[0].querySelector("svg")).not.toBeNull();
    expect(rows[1].querySelector("svg")).toBeNull();
    expect(rows[2].querySelector("svg")).toBeNull();
    expect(rows[2].textContent).toContain("Oldtimer");
});
