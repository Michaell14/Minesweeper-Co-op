// @vitest-environment jsdom
/**
 * The board-records read, the one stats call a GAME page makes. What matters
 * is the shape handed to the store, and null rather than an empty table when
 * the call fails: an empty table reads as "never cleared anything".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/authBridge", () => ({
    getBridgeToken: vi.fn(async () => tokenState.token),
    clearBridgeToken: vi.fn(),
}));
vi.mock("@/lib/initSocket", () => ({ serverURL: "http://test" }));

import { fetchBoardBests } from "./statsApi";

const tokenState: { token: string | null } = { token: "tok" };

const respondWith = (body: unknown, { ok = true, status = 200 } = {}) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status, json: async () => body })));

beforeEach(() => {
    tokenState.token = "tok";
});

afterEach(() => vi.unstubAllGlobals());

describe("a table that arrives", () => {
    it("keys each record the way the game looks it up", async () => {
        respondWith({
            boardBests: [
                { boardKey: "16x16/40", seconds: 92, players: 1, achievedAt: "2026-08-02T12:00:00.000Z" },
                { boardKey: "16x16/40@3", seconds: 41, players: 3, achievedAt: "2026-08-03T12:00:00.000Z" },
            ],
        });

        const bests = await fetchBoardBests();

        expect(bests).toEqual({
            "16x16/40": { seconds: 92, players: 1, at: Date.UTC(2026, 7, 2, 12) },
            "16x16/40@3": { seconds: 41, players: 3, at: Date.UTC(2026, 7, 3, 12) },
        });
    });

    it("sends the bearer token to the bests endpoint", async () => {
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ boardBests: [] }) }));
        vi.stubGlobal("fetch", fetchMock);

        await fetchBoardBests();

        expect(fetchMock).toHaveBeenCalledWith(
            "http://test/api/stats/bests",
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) }),
        );
    });

    it("an account with no records is an empty table, not a missing one", async () => {
        respondWith({ boardBests: [] });
        expect(await fetchBoardBests()).toEqual({});
    });

    /*
     * A server ahead of the key migration serves rows keyed by board alone;
     * re-filing on arrival keeps the banner from reading blank.
     */
    it("re-files a record whose key predates the player count", async () => {
        respondWith({
            boardBests: [
                { boardKey: "16x16/40", seconds: 41, players: 3, achievedAt: "2026-08-03T12:00:00.000Z" },
            ],
        });

        const bests = await fetchBoardBests();

        expect(bests?.["16x16/40@3"]?.seconds).toBe(41);
        expect(bests?.["16x16/40"]).toBeUndefined();
    });

    it("survives an unparseable timestamp rather than storing NaN", async () => {
        respondWith({
            boardBests: [{ boardKey: "9x9/10", seconds: 30, players: 1, achievedAt: "not a date" }],
        });

        expect((await fetchBoardBests())?.["9x9/10"].at).toBe(0);
    });
});

describe("a table that does not", () => {
    it("is null when signed out — there is no token to send", async () => {
        tokenState.token = null;
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        expect(await fetchBoardBests()).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is null when stats are unavailable", async () => {
        respondWith({ error: "Stats are temporarily unavailable" }, { ok: false, status: 503 });
        expect(await fetchBoardBests()).toBeNull();
    });

    it("is null when the network drops, rather than throwing on a game page", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
        expect(await fetchBoardBests()).toBeNull();
    });

    it("is null when the payload is not the shape it claims", async () => {
        respondWith({ boardBests: "all of them" });
        expect(await fetchBoardBests()).toBeNull();
    });
});
