// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import type { Cell } from "@/shared/socketPayloads";
import { buildDailyShareText, buildPaceBar, percentCleared } from "./dailyShare";

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
     * /daily reads no parameters. A share link that grew one would be state the
     * sender chose for the reader, on a puzzle that is meant to arrive the same
     * way for everybody.
     */
    test("carries no query string", () => {
        const url = buildDailyShareText({ ...base, rank: 1, totalEntries: 2, streak: 9 })
            .split("\n")
            .at(-1)!;

        expect(url).toContain("/daily");
        expect(url).not.toContain("?");
    });
});

describe("buildPaceBar", () => {
    /* Even 1s-per-decile pace: every decile matches the average exactly. */
    const steady = Array.from({ length: 10 }, (_, i) => (i + 1) * 1_000);

    test("a steady win is ten on-pace squares", () => {
        expect(buildPaceBar(steady, true)).toBe("🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩");
    });

    test("a slow stretch shows against the run's own average", () => {
        // Deciles of 1s except the fifth, which took 11s -> avg 2s.
        const ms = [1_000, 2_000, 3_000, 4_000, 15_000, 16_000, 17_000, 18_000, 19_000, 20_000];
        expect(buildPaceBar(ms, true)).toBe("🟩🟩🟩🟩🟨🟩🟩🟩🟩🟩");
    });

    /*
     * The board's free opening stamps its deciles at elapsed 0. A mean over
     * ALL deciles would make every real decile of a perfectly steady run read
     * as "slower than average" — the bar's one job done exactly backwards —
     * so the average must exclude the instant ones.
     */
    test("the free opening's instant deciles don't drag the average", () => {
        // One free decile, then nine perfectly steady seconds.
        const oneFree = [0, ...Array.from({ length: 9 }, (_, i) => (i + 1) * 1_000)];
        expect(buildPaceBar(oneFree, true)).toBe("🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩");

        // Two free deciles, then eight steady.
        const twoFree = [0, 0, ...Array.from({ length: 8 }, (_, i) => (i + 1) * 1_000)];
        expect(buildPaceBar(twoFree, true)).toBe("🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩");
    });

    test("a loss with a free decile stays honest about the paced ones", () => {
        // Free decile, one 1s decile, one 3s decile -> avg of paced = 2s.
        expect(buildPaceBar([0, 1_000, 4_000], false)).toBe("🟩🟩🟨💥⬜⬜⬜⬜⬜⬜");
    });

    test("a loss truncates with a boom and pads the unreached deciles", () => {
        expect(buildPaceBar([1_000, 2_000, 3_000, 4_000], false)).toBe("🟩🟩🟩🟩💥⬜⬜⬜⬜⬜");
    });

    test("a loss that survived nine deciles has no padding left", () => {
        expect(buildPaceBar(steady.slice(0, 9), false)).toBe("🟩🟩🟩🟩🟩🟩🟩🟩🟩💥");
    });

    test("the bar is always exactly ten characters", () => {
        for (const [ms, won] of [[steady, true], [[500], false], [steady.slice(0, 7), false]] as const) {
            expect(Array.from(buildPaceBar(ms as number[], won)!)).toHaveLength(10);
        }
    });

    /* Better no bar than a wrong one: each of these is data the bar's maths
     * cannot honestly draw. */
    test("refuses data it cannot draw", () => {
        expect(buildPaceBar([], true)).toBeNull(); // pre-pace attempt
        expect(buildPaceBar(steady.slice(0, 5), true)).toBeNull(); // a "win" missing deciles
        expect(buildPaceBar(steady, false)).toBeNull(); // 100% open IS the win
        expect(buildPaceBar([], false)).toBeNull(); // died inside the first decile
        expect(buildPaceBar([5_000, 3_000], false)).toBeNull(); // time went backwards
    });
});

describe("buildDailyShareText: the pace bar line", () => {
    const steady = Array.from({ length: 10 }, (_, i) => (i + 1) * 1_000);

    test("a win with milestones carries the bar between result and link", () => {
        const lines = buildDailyShareText({ ...base, milestones: steady }).split("\n");

        expect(lines[2]).toBe("🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩");
        expect(lines.at(-1)).toContain("/daily");
    });

    test("a loss's bar ends in the boom", () => {
        const text = buildDailyShareText({ ...base, status: "failed", milestones: [1_000, 2_000] });

        expect(text).toContain("🟩🟩💥⬜⬜⬜⬜⬜⬜⬜");
    });

    test("no milestones, no bar line — the text falls back to Phase 1 shape", () => {
        const text = buildDailyShareText({ ...base, milestones: null });

        expect(text).not.toContain("🟩");
        expect(text.split("\n")).toHaveLength(3);
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
