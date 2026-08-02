// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The token a daily attempt is filed under.
 *
 * It is opaque and per-browser, so nothing about it looks wrong when it is
 * wrong. Two failures used to live here, and both took the whole feature out
 * with no error anywhere:
 *
 *  - it was re-derived from the CLIENT's "today" on every single move, so a
 *    browser crossing UTC midnight mid-attempt swapped it. The server still
 *    held the attempt under the old one, so every click addressed a record that
 *    did not exist and was dropped in silence — the board just stopped.
 *
 *  - the write was unguarded, so with storage blocked (Safari private browsing)
 *    it threw out of `startDaily` and the button did nothing at all.
 */

const STORAGE_KEY = "minesweeper_daily_identity";
const MIDNIGHT = new Date("2026-08-01T23:59:50Z");

/**
 * A fresh copy of the module, i.e. a fresh page load. The in-memory fallback is
 * module state that deliberately outlives every call on one page, so a shared
 * import would leak one test's token into the next.
 */
const loadIdentity = () => {
    vi.resetModules();
    return import("./dailyIdentity");
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDNIGHT);
    localStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("starting an attempt", () => {
    test("mints a token and remembers it for today", async () => {
        const { getOrCreateDailyAttemptToken } = await loadIdentity();

        const token = getOrCreateDailyAttemptToken();

        expect(token).not.toBe("");
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
            date: "2026-08-01",
            token,
        });
    });

    test("a second start on the same day reuses it, so there is one attempt", async () => {
        const { getOrCreateDailyAttemptToken } = await loadIdentity();

        expect(getOrCreateDailyAttemptToken()).toBe(getOrCreateDailyAttemptToken());
    });

    test("a new day mints a new one", async () => {
        const { getOrCreateDailyAttemptToken } = await loadIdentity();

        const yesterday = getOrCreateDailyAttemptToken();

        vi.setSystemTime(new Date("2026-08-02T00:00:10Z"));

        expect(getOrCreateDailyAttemptToken()).not.toBe(yesterday);
    });
});

describe("a move made by an attempt already in flight", () => {
    test("keeps the token it started under, across UTC midnight", async () => {
        const { getOrCreateDailyAttemptToken, readDailyAttemptToken } = await loadIdentity();

        const started = getOrCreateDailyAttemptToken();

        // Ten seconds later the browser's day has rolled over. The server's
        // attempt has not: it is still filed under the token above.
        vi.setSystemTime(new Date("2026-08-02T00:00:00Z"));

        expect(readDailyAttemptToken()).toBe(started);
    });

    test("reports nothing rather than inventing a token", async () => {
        const { readDailyAttemptToken } = await loadIdentity();

        expect(readDailyAttemptToken()).toBe("");
    });
});

describe("when localStorage cannot be written", () => {
    const blockWrites = () =>
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("QuotaExceededError");
        });

    test("still hands back a usable token instead of throwing", async () => {
        const { getOrCreateDailyAttemptToken } = await loadIdentity();
        blockWrites();

        expect(() => getOrCreateDailyAttemptToken()).not.toThrow();
        expect(getOrCreateDailyAttemptToken()).not.toBe("");
    });

    test("the attempt's moves find the same token, so the game is playable", async () => {
        const { getOrCreateDailyAttemptToken, readDailyAttemptToken } = await loadIdentity();
        blockWrites();

        const started = getOrCreateDailyAttemptToken();

        expect(readDailyAttemptToken()).toBe(started);
    });
});
