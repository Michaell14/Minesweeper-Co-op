// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
    bestsForImport,
    boardKey,
    boardLabel,
    hasImportedBests,
    markBestsImported,
    playersForClear,
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

    /*
     * Two people splitting a board finish it faster than one person can, more
     * or less by construction. Sharing a slot, the group time took it and then
     * held it: every solo run afterwards quietly failed to be a record, and the
     * caption read "Best 1:23 with 2 players" — a bar you cannot reach alone.
     */
    test("a group's clear is a different result from a solo one", () => {
        expect(boardKey(16, 16, 40, 2)).not.toBe(boardKey(16, 16, 40, 1));
        expect(boardKey(16, 16, 40, 3)).not.toBe(boardKey(16, 16, 40, 2));
    });

    /* Records set before the count was part of the key are all under this
     * spelling, so solo has to keep it or every one of them is orphaned. */
    test("solo keeps the bare board string", () => {
        expect(boardKey(9, 9, 10, 1)).toBe("9x9/10");
        expect(boardKey(9, 9, 10)).toBe("9x9/10");
    });
});

describe("how many players a clear counts as", () => {
    test("co-op counts everyone in the room", () => {
        expect(playersForClear("co-op", 3)).toBe(3);
    });

    /*
     * A race is SOLO work — you clear the whole board yourself and your
     * opponent never touches it — even though both of you are in the room.
     * Counting the room filed a race next to co-op clears that split the board
     * between two people, and captioned it "with 2 players".
     */
    test("a PVP race counts as one, however many are racing", () => {
        expect(playersForClear("pvp", 2)).toBe(1);
    });

    test("an empty roster still counts as one", () => {
        expect(playersForClear("co-op", 0)).toBe(1);
    });
});

describe("naming a board", () => {
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
        recordBestTime(boardKey(16, 16, 40, 3), { seconds: 90, players: 3, at: 1_000 });

        expect(readBestTime(boardKey(16, 16, 40, 3))?.players).toBe(3);
    });
});

/*
 * Everything already stored is filed under the bare board string, whatever
 * group set it — that WAS the bug. So reading re-files each record under the
 * key its own `players` implies, which is the same rule writing uses. Nothing
 * is invented: the count has been stored on every record all along.
 */
describe("records written before the count was part of the key", () => {
    const storedAs = (entries: Record<string, unknown>) =>
        window.localStorage.setItem("minesweeper_best_times", JSON.stringify(entries));

    test("a group's clear moves off the slot a solo run needs", () => {
        storedAs({ "16x16/40": { seconds: 40, players: 3, at: 1 } });

        expect(readBestTime(boardKey(16, 16, 40, 3))?.seconds).toBe(40);
        expect(readBestTime(boardKey(16, 16, 40))).toBeNull();
    });

    test("a solo clear stays exactly where it was", () => {
        storedAs({ "16x16/40": { seconds: 95, players: 1, at: 1 } });

        expect(readBestTime(boardKey(16, 16, 40))?.seconds).toBe(95);
    });

    /* Older still: no `players` at all, which parses as one. */
    test("a record from before the count was even stored reads as solo", () => {
        storedAs({ "16x16/40": { seconds: 95 } });

        expect(readBestTime(boardKey(16, 16, 40))?.seconds).toBe(95);
    });

    /*
     * Re-filing happens in memory on every read; the next write is what commits
     * it. Reading the raw storage back is the only way to see that, and it also
     * pins the no-op-on-its-own-output property — the committed shape is the one
     * the next read would produce anyway.
     */
    test("the next write commits the re-filing, and reading it back moves nothing", () => {
        storedAs({ "16x16/40": { seconds: 40, players: 3, at: 1 } });

        recordBestTime(boardKey(9, 9, 10), { seconds: 10, players: 1, at: 1 });

        const persisted = Object.keys(
            JSON.parse(window.localStorage.getItem("minesweeper_best_times")!),
        );
        expect(persisted).toContain("16x16/40@3");
        expect(persisted).not.toContain("16x16/40");

        expect(readBestTime(boardKey(16, 16, 40, 3))?.seconds).toBe(40);
        expect(readBestTime(boardKey(16, 16, 40))).toBeNull();
    });

    /*
     * Two records can land on one key — a board cleared solo before the change
     * and again after. Keeping the faster is the rule recordBestTime already
     * applies, so the surviving record is the one that would have survived
     * anyway.
     */
    test("two records landing on one key keep the faster", () => {
        storedAs({
            "16x16/40": { seconds: 95, players: 1, at: 1 },
            "16x16/40@1": { seconds: 80, players: 1, at: 2 },
        });

        expect(readBestTime(boardKey(16, 16, 40))?.seconds).toBe(80);
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

    /* The count is part of the key now, so a fractional one would file the
     * record in a slot nothing ever looks up. */
    test("a player count that is not a whole number reads as solo", () => {
        window.localStorage.setItem(
            "minesweeper_best_times",
            JSON.stringify({ "9x9/10": { seconds: 30, players: 2.5, at: 1 } }),
        );

        expect(readBestTime(boardKey(9, 9, 10))?.seconds).toBe(30);
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


/**
 * The import payload. The cap is the part that matters: the endpoint refuses an
 * oversized payload WHOLE rather than truncating it, so a browser with enough
 * records would otherwise fail to import anything, every time, silently.
 */
describe("bestsForImport", () => {
    test("carries each record as the endpoint takes it", () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 30, players: 1, at: 7 });

        expect(bestsForImport(10)).toEqual([
            { boardKey: "9x9/10", seconds: 30, players: 1, achievedAt: 7 },
        ]);
    });

    test("keeps group clears keyed as they are stored", () => {
        recordBestTime(boardKey(16, 16, 40, 3), { seconds: 120, players: 3, at: 1 });

        expect(bestsForImport(10)[0].boardKey).toBe("16x16/40@3");
    });

    test("drops the oldest when there are more than the cap allows", () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 30, players: 1, at: 1 });
        recordBestTime(boardKey(16, 16, 40), { seconds: 300, players: 1, at: 9 });

        expect(bestsForImport(1)).toEqual([
            { boardKey: "16x16/40", seconds: 300, players: 1, achievedAt: 9 },
        ]);
    });

    test("an empty browser has nothing to send", () => {
        expect(bestsForImport(10)).toEqual([]);
    });
});

describe("the import watermark", () => {
    test("starts unset, so the fold-in is offered once", () => {
        expect(hasImportedBests()).toBe(false);
    });

    test("stays set once the records have been folded in", () => {
        markBestsImported();
        expect(hasImportedBests()).toBe(true);
    });
});
