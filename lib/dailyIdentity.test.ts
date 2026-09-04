// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The token a daily attempt is filed under: opaque and per-browser, so nothing
 * looks wrong when it is. Two silent failures lived here: re-deriving it from
 * the CLIENT's "today" on every move swapped it at UTC midnight mid-attempt
 * (the board just stopped), and an unguarded write threw out of `startDaily`
 * with storage blocked.
 */

const STORAGE_KEY = "minesweeper_daily_identity";
const MIDNIGHT = new Date("2026-08-01T23:59:50Z");

/**
 * A fresh copy of the module, i.e. a fresh page load: the in-memory fallback
 * is module state, so a shared import would leak one test's token into the next.
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

        // The browser's day has rolled over; the server's attempt is still under the token above.
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

    /*
     * The failed write leaves YESTERDAY's record in storage, readable and wrong.
     * Preferring storage "when it has something" would reintroduce the silent freeze.
     */
    test("does not fall back to the token of a day that has already gone", async () => {
        const { getOrCreateDailyAttemptToken, readDailyAttemptToken } = await loadIdentity();
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ date: "2026-07-31", token: "yesterdays-token" }),
        );
        blockWrites();

        const started = getOrCreateDailyAttemptToken();

        expect(started).not.toBe("yesterdays-token");
        expect(readDailyAttemptToken()).toBe(started);
    });
});
