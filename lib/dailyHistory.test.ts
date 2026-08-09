// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { clearDailyHistory, dailyWinStreak, readDailyHistory, recordDailyResult } from "./dailyHistory";

const STORAGE_KEY = "minesweeper_daily_history";

afterEach(() => {
    clearDailyHistory();
});

describe("recording and reading", () => {
    test("round-trips a result under its puzzle date", () => {
        recordDailyResult("2026-08-08", { won: true });

        expect(readDailyHistory()).toEqual({ "2026-08-08": { won: true } });
    });

    /* A terminal attempt is immutable, so a second write is a re-delivery
     * (resume, second tab) — never new information. */
    test("first write wins for a date", () => {
        recordDailyResult("2026-08-08", { won: true });
        recordDailyResult("2026-08-08", { won: false });

        expect(readDailyHistory()["2026-08-08"]).toEqual({ won: true });
    });

    test("a corrupt blob reads as empty rather than throwing", () => {
        window.localStorage.setItem(STORAGE_KEY, "{not json");

        expect(readDailyHistory()).toEqual({});
    });

    test("drops entries that are not results, and keys that are not days", () => {
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                "2026-08-08": { won: true },
                "2026-08-07": { won: "yes" },   // not a boolean
                "not-a-date": { won: true },
                "2026-08-06": null,
            }),
        );

        expect(Object.keys(readDailyHistory())).toEqual(["2026-08-08"]);
    });

    /* Entries written by the schema's first version carried an elapsedMs;
     * they must still read as results, minus the field nothing consumed. */
    test("tolerates extra fields from older entries", () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ "2026-08-08": { won: true, elapsedMs: 90_000 } }));

        expect(readDailyHistory()["2026-08-08"]).toEqual({ won: true });
    });
});

describe("dailyWinStreak", () => {
    const win = { won: true };
    const loss = { won: false };

    test("counts consecutive wins walking back from the end date", () => {
        const history = { "2026-08-06": win, "2026-08-07": win, "2026-08-08": win };

        expect(dailyWinStreak(history, "2026-08-08")).toBe(3);
    });

    test("stops at a gap", () => {
        const history = { "2026-08-05": win, "2026-08-07": win, "2026-08-08": win };

        expect(dailyWinStreak(history, "2026-08-08")).toBe(2);
    });

    test("stops at a loss", () => {
        const history = { "2026-08-06": win, "2026-08-07": loss, "2026-08-08": win };

        expect(dailyWinStreak(history, "2026-08-08")).toBe(1);
    });

    test("a loss on the end date itself is a streak of 0", () => {
        const history = { "2026-08-07": win, "2026-08-08": loss };

        expect(dailyWinStreak(history, "2026-08-08")).toBe(0);
    });

    test("an unplayed end date is a streak of 0", () => {
        expect(dailyWinStreak({ "2026-08-07": win }, "2026-08-08")).toBe(0);
    });

    /* dayBefore does epoch maths, so the walk must survive month and year
     * boundaries — the string-decrement trap would break both of these. */
    test("walks across a month boundary", () => {
        const history = { "2026-07-31": win, "2026-08-01": win };

        expect(dailyWinStreak(history, "2026-08-01")).toBe(2);
    });

    test("walks across a year boundary", () => {
        const history = { "2025-12-31": win, "2026-01-01": win };

        expect(dailyWinStreak(history, "2026-01-01")).toBe(2);
    });
});
