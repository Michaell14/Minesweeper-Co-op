// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
    boardKey,
    boardLabel,
    clearBestTimes,
    readBestTime,
    readBestTimes,
    recordBestTime,
} from "./bestTimes";

/**
 * Personal best times.
 *
 * Two things make this worth testing rather than eyeballing. It reads
 * localStorage, which is shared with the user and with anything else on the
 * origin, so it has to treat what it finds there as untrusted — a corrupt blob
 * must lose the records, not throw on a page with a live game in it. And the
 * key has to survive a joiner whose size/difficulty labels describe a different
 * board entirely, which is why it is built from the numbers.
 */

const KEY = boardKey(16, 16, 40);

afterEach(() => {
    clearBestTimes();
    vi.restoreAllMocks();
});

describe("identifying a board", () => {
    test("is built from the dimensions and mine count", () => {
        expect(boardKey(9, 9, 10)).toBe("9x9/10");
    });

    /*
     * The reason the key is not the labels. `setDimensions` gives a joining
     * player the room's numbers and leaves `boardSize`/`difficulty` at whatever
     * they last picked, so a label-keyed record files their win under a board
     * they never played.
     */
    test("two different boards never collide", () => {
        expect(boardKey(16, 16, 40)).not.toBe(boardKey(16, 16, 60));
        expect(boardKey(20, 16, 40)).not.toBe(boardKey(16, 16, 40));
    });

    test("names a board that matches a preset", () => {
        expect(boardLabel(9, 9, 10)).toBe("Small / Easy");
    });

    test("falls back to the raw shape for a custom board", () => {
        expect(boardLabel(12, 11, 17)).toBe("12x11, 17 mines");
    });
});

describe("recording a run", () => {
    test("a first clear always sets the record", () => {
        const result = recordBestTime(KEY, { seconds: 120, players: 1, at: 1_000 });

        expect(result.improved).toBe(true);
        expect(result.previous).toBeNull();
        expect(readBestTime(KEY)?.seconds).toBe(120);
    });

    test("a faster clear replaces it, and reports what it beat", () => {
        recordBestTime(KEY, { seconds: 120, players: 1, at: 1_000 });

        const result = recordBestTime(KEY, { seconds: 90, players: 1, at: 2_000 });

        expect(result.improved).toBe(true);
        expect(result.previous?.seconds).toBe(120);
        expect(readBestTime(KEY)?.seconds).toBe(90);
    });

    test("a slower clear is dropped rather than overwriting", () => {
        recordBestTime(KEY, { seconds: 90, players: 1, at: 1_000 });

        const result = recordBestTime(KEY, { seconds: 200, players: 1, at: 2_000 });

        expect(result.improved).toBe(false);
        expect(readBestTime(KEY)?.seconds).toBe(90);
    });

    /* Equal is not better; the earlier record keeps its date. */
    test("matching the record does not replace it", () => {
        recordBestTime(KEY, { seconds: 90, players: 1, at: 1_000 });

        const result = recordBestTime(KEY, { seconds: 90, players: 1, at: 5_000 });

        expect(result.improved).toBe(false);
        expect(readBestTime(KEY)?.at).toBe(1_000);
    });

    test("records are kept per board, not merged into one", () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 30, players: 1, at: 1_000 });
        recordBestTime(boardKey(16, 16, 40), { seconds: 300, players: 1, at: 1_000 });

        expect(readBestTime(boardKey(9, 9, 10))?.seconds).toBe(30);
        expect(readBestTime(boardKey(16, 16, 40))?.seconds).toBe(300);
    });

    /* What stops the number lying about what it took to get. */
    test("remembers how many players it took", () => {
        recordBestTime(KEY, { seconds: 90, players: 3, at: 1_000 });

        expect(readBestTime(KEY)?.players).toBe(3);
    });
});

describe("reading a board never cleared", () => {
    test("is null rather than a zero that looks like a record", () => {
        expect(readBestTime(KEY)).toBeNull();
    });
});

describe("when localStorage is not to be trusted", () => {
    test("a corrupt blob loses the records instead of throwing", () => {
        window.localStorage.setItem("minesweeper_best_times", "{not json");

        expect(() => readBestTimes()).not.toThrow();
        expect(readBestTimes()).toEqual({});
    });

    test("an array where an object belongs is ignored", () => {
        window.localStorage.setItem("minesweeper_best_times", "[1,2,3]");

        expect(readBestTimes()).toEqual({});
    });

    /* One bad entry must not take the rest of the records with it. */
    test("a single unreadable entry is dropped, the others survive", () => {
        window.localStorage.setItem(
            "minesweeper_best_times",
            JSON.stringify({
                "9x9/10": { seconds: 30, players: 1, at: 1 },
                "16x16/40": { seconds: "fast" },
            }),
        );

        const times = readBestTimes();
        expect(times["9x9/10"].seconds).toBe(30);
        expect(times["16x16/40"]).toBeUndefined();
    });

    test("an entry from before player counts existed still reads", () => {
        window.localStorage.setItem(
            "minesweeper_best_times",
            JSON.stringify({ "9x9/10": { seconds: 30 } }),
        );

        expect(readBestTimes()["9x9/10"]).toEqual({ seconds: 30, players: 1, at: 0 });
    });

    test("a negative time is not a time", () => {
        window.localStorage.setItem(
            "minesweeper_best_times",
            JSON.stringify({ "9x9/10": { seconds: -5 } }),
        );

        expect(readBestTimes()).toEqual({});
    });

    /* Safari private browsing throws on read; a game must not go down with it. */
    test("a storage that throws on read degrades to no records", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("blocked");
        });

        expect(() => readBestTimes()).not.toThrow();
        expect(readBestTimes()).toEqual({});
    });

    test("a storage that throws on write still reports the record", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota");
        });

        expect(() => recordBestTime(KEY, { seconds: 90, players: 1, at: 1 })).not.toThrow();
        expect(recordBestTime(KEY, { seconds: 90, players: 1, at: 1 }).improved).toBe(true);
    });
});
