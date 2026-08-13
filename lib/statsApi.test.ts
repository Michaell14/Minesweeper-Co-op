import { afterEach, describe, expect, test, vi } from "vitest";

// Signed in for every test: the sync calls under test only run authenticated,
// and an absent token would make them all pass vacuously by returning early.
vi.mock("@/lib/authBridge", () => ({
    getBridgeToken: vi.fn(async () => "token"),
}));

import { MAX_BEST_PUSH, fetchBests, importBests, isPushableBest } from "./statsApi";

/**
 * The sync's wire boundary. Two things are worth pinning here. The
 * ms↔ISO timestamp conversion stops at this file, so a drift would corrupt
 * every record silently. And the push-side mirror of the server's import
 * contract prevents a silent, permanent failure: the server rejects a whole
 * payload on one bad entry, and localStorage legally holds entries the
 * contract refuses.
 */

const RECORD = { boardKey: "16x16/40", seconds: 92, players: 1, at: 1_754_000_000_000 };

const jsonResponse = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as Response;

/** The JSON body the mocked fetch was handed. */
const sentBody = (fetchMock: ReturnType<typeof vi.fn>) => {
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(init.body) as { bests: unknown[] };
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("isPushableBest", () => {
    test("accepts a solo record and a group clear's suffixed key", () => {
        expect(isPushableBest(RECORD)).toBe(true);
        expect(isPushableBest({ ...RECORD, boardKey: "16x16/40@3", players: 3 })).toBe(true);
    });

    /* A co-op board left open past a day clears with a legal LOCAL time the
     * server refuses; it must be left behind, not poison the payload. */
    test("rejects a run longer than the server accepts", () => {
        expect(isPushableBest({ ...RECORD, seconds: 100_000 })).toBe(false);
    });

    test.each([
        ["a junk board key", { ...RECORD, boardKey: "junk@3" }],
        ["dimensions past the bound", { ...RECORD, boardKey: "1000x16/40" }],
        ["a zero player count", { ...RECORD, players: 0 }],
        ["a fractional player count", { ...RECORD, players: 2.5 }],
        ["a player count past the bound", { ...RECORD, players: 101 }],
        ["a negative time", { ...RECORD, seconds: -1 }],
        ["an unusable timestamp", { ...RECORD, at: Number.NaN }],
    ])("rejects %s", (_label, best) => {
        expect(isPushableBest(best)).toBe(false);
    });

    test("the payload cap matches the server's bound", () => {
        expect(MAX_BEST_PUSH).toBe(100);
    });
});

describe("fetchBests", () => {
    test("hands back the account and epoch-ms records, not the wire's ISO strings", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            userId: "acct-1",
            bests: [{ boardKey: "9x9/10", seconds: 30, players: 1, achievedAt: "2026-08-01T12:00:00Z" }],
        })));

        expect(await fetchBests()).toEqual({
            userId: "acct-1",
            bests: [
                { boardKey: "9x9/10", seconds: 30, players: 1, at: Date.parse("2026-08-01T12:00:00Z") },
            ],
        });
    });

    test("an unreadable timestamp becomes 0 rather than NaN", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            userId: "acct-1",
            bests: [{ boardKey: "9x9/10", seconds: 30, players: 1, achievedAt: "not a date" }],
        })));

        expect((await fetchBests())?.bests[0]?.at).toBe(0);
    });

    test("a malformed body reads as unavailable, not as empty", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ unexpected: true })));

        expect(await fetchBests()).toBeNull();
    });

    /* A pull whose account is unknown cannot be scoped to it, so a backend
     * that predates the field reads as unavailable and the sync waits. */
    test("a body without the account reads as unavailable", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
            bests: [{ boardKey: "9x9/10", seconds: 30, players: 1, achievedAt: "2026-08-01T12:00:00Z" }],
        })));

        expect(await fetchBests()).toBeNull();
    });
});

describe("importBests", () => {
    /* The return value is the claim list — the caller marks exactly these as
     * the account's, so it must name what was sent, never what was left out. */
    test("pushes only contract-fitting entries and reports exactly those", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }) as Response);
        vi.stubGlobal("fetch", fetchMock);

        const landed = await importBests([RECORD, { ...RECORD, boardKey: "9x9/10", seconds: 100_000 }]);

        expect(landed).toEqual([RECORD]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(sentBody(fetchMock).bests).toEqual([
            { boardKey: "16x16/40", seconds: 92, players: 1, achievedAt: RECORD.at },
        ]);
    });

    test("nothing pushable sends nothing and counts as success", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        expect(await importBests([{ ...RECORD, seconds: -1 }])).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test("a failed push reports null, not an empty claim", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 }) as Response));

        expect(await importBests([RECORD])).toBeNull();
    });

    test("caps the payload at the server's bound", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 204 }) as Response);
        vi.stubGlobal("fetch", fetchMock);

        const landed = await importBests(
            Array.from({ length: MAX_BEST_PUSH + 5 }, (_, i) => ({
                ...RECORD,
                boardKey: `9x9/${i + 1}`,
            })),
        );

        expect(sentBody(fetchMock).bests).toHaveLength(MAX_BEST_PUSH);
        expect(landed).toHaveLength(MAX_BEST_PUSH);
    });
});
