// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { Cell } from "@/shared/socketPayloads";
import { buildDailyShareText, percentCleared } from "./dailyShare";

/**
 * The share text is the one piece of this app pasted into places we cannot
 * see, so its shape is pinned here: every line has to earn its spot, missing
 * data drops its line rather than printing a placeholder, and nothing
 * positional about the shared board ever appears (everyone plays the same
 * seeded puzzle — see the module's own comment).
 */

const base = {
    date: "2026-08-08",
    status: "completed" as const,
    elapsedMs: 222_000, // 3:42
    rank: null,
    totalEntries: null,
    streak: null,
    progressPercent: null,
};

describe("buildDailyShareText: wins", () => {
    test("carries the date, the time, and the /daily link", () => {
        const text = buildDailyShareText(base);

        expect(text).toContain("2026-08-08");
        expect(text).toContain("✅ Solved in 3:42");
        expect(text).toContain(`${window.location.origin}/daily`);
    });

    test("includes the rank only when both rank and field size are known", () => {
        expect(buildDailyShareText({ ...base, rank: 12, totalEntries: 87 })).toContain("Rank #12 of 87");
        expect(buildDailyShareText({ ...base, rank: 12 })).not.toContain("Rank");
    });

    test("brags about a streak from 2 days up", () => {
        expect(buildDailyShareText({ ...base, streak: 5 })).toContain("🔥 5-day streak");
    });

    /* Day one's "streak" is just the win the line above already reports. */
    test("stays quiet about a streak of 0 or 1", () => {
        expect(buildDailyShareText({ ...base, streak: 1 })).not.toContain("🔥");
        expect(buildDailyShareText({ ...base, streak: 0 })).not.toContain("🔥");
        expect(buildDailyShareText({ ...base, streak: null })).not.toContain("🔥");
    });
});

describe("buildDailyShareText: losses", () => {
    const loss = { ...base, status: "failed" as const, elapsedMs: 77_000 }; // 1:17

    test("reports the boom and how far the run got", () => {
        const text = buildDailyShareText({ ...loss, progressPercent: 43 });

        expect(text).toContain("💥 Hit a mine at 1:17 — 43% cleared");
    });

    test("omits progress when there is no board to measure it from", () => {
        expect(buildDailyShareText(loss)).toContain("💥 Hit a mine at 1:17");
        expect(buildDailyShareText(loss)).not.toContain("% cleared");
    });

    test("never shows a streak line — the loss just ended it", () => {
        expect(buildDailyShareText({ ...loss, streak: 5 })).not.toContain("🔥");
    });
});

describe("buildDailyShareText: the link", () => {
    /*
     * Regression pin for lib/dailyIntent.ts's rule: starting consumes the
     * reader's one attempt for the day, so intent must come from a gesture in
     * their tab — a query parameter would let a pasted link spend it for them.
     */
    test("carries no query string that could auto-start an attempt", () => {
        const url = buildDailyShareText({ ...base, rank: 1, totalEntries: 2, streak: 9 })
            .split("\n")
            .at(-1)!;

        expect(url).toContain("/daily");
        expect(url).not.toContain("?");
    });
});

/** A terminal-shaped cell: `isMine` truthful everywhere, as revealMines delivers. */
const cell = (over: Partial<Cell>): Cell => ({ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0, ...over });

describe("percentCleared", () => {
    test("counts opened safe cells against all safe cells, mines excluded", () => {
        // 4 safe (3 open), 2 mines — mines contribute to neither side.
        const board = [
            [cell({ isOpen: true }), cell({ isOpen: true }), cell({ isMine: true, isOpen: true })],
            [cell({ isOpen: true }), cell({}), cell({ isMine: true, isFlagged: true })],
        ];

        expect(percentCleared(board)).toBe(75);
    });

    test("rounds to a whole percent", () => {
        const board = [[cell({ isOpen: true }), cell({}), cell({})]]; // 1 of 3

        expect(percentCleared(board)).toBe(33);
    });

    test("returns null for a missing board rather than inventing 0%", () => {
        expect(percentCleared([])).toBeNull();
    });
});
