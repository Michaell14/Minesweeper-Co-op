import { afterEach, describe, expect, test } from "vitest";
import { useMinesweeperStore } from "@/app/store";

/**
 * The account's board records, as the game holds them.
 *
 * Everything here is about the difference between "no account records" and "no
 * record on this board", which look identical in a banner and are not the same
 * thing: the first has to fall back to the browser, the second is a board you
 * have never cleared.
 */

const state = () => useMinesweeperStore.getState();

afterEach(() => state().setAccountBests(null));

describe("with no account copy in play", () => {
    test("starts null, which is what sends every reader to the browser", () => {
        expect(state().accountBests).toBeNull();
    });

    test("a clear files nothing and says so, so the local result is shown", () => {
        expect(state().recordAccountBest("16x16/40", { seconds: 90, players: 1, at: 1 })).toBeNull();
        expect(state().accountBests).toBeNull();
    });
});

describe("with the account's records loaded", () => {
    test("a first clear of a board is a record", () => {
        state().setAccountBests({});

        const result = state().recordAccountBest("16x16/40", { seconds: 90, players: 1, at: 5 });

        expect(result).toEqual({ improved: true, previous: null });
        expect(state().accountBests?.["16x16/40"].seconds).toBe(90);
    });

    test("a faster clear takes the record and reports what it beat", () => {
        state().setAccountBests({ "16x16/40": { seconds: 90, players: 1, at: 1 } });

        const result = state().recordAccountBest("16x16/40", { seconds: 75, players: 1, at: 5 });

        expect(result?.improved).toBe(true);
        expect(result?.previous?.seconds).toBe(90);
        expect(state().accountBests?.["16x16/40"].seconds).toBe(75);
    });

    /*
     * The case the whole change exists for: signed in on a new device, the
     * browser has no record and the account does. Comparing against
     * localStorage would call this a new best and say so in a banner.
     */
    test("a slower clear leaves the record standing", () => {
        state().setAccountBests({ "16x16/40": { seconds: 75, players: 1, at: 1 } });

        const result = state().recordAccountBest("16x16/40", { seconds: 90, players: 1, at: 5 });

        expect(result?.improved).toBe(false);
        expect(state().accountBests?.["16x16/40"].seconds).toBe(75);
    });

    test("a group clear cannot land on the solo slot, however the key is spelled", () => {
        state().setAccountBests({ "16x16/40": { seconds: 300, players: 1, at: 1 } });

        // The key says solo, the run says three: the run decides, as it does in
        // the browser's copy and in the import.
        const result = state().recordAccountBest("16x16/40", { seconds: 120, players: 3, at: 5 });

        expect(result).toEqual({ improved: true, previous: null });
        expect(state().accountBests?.["16x16/40@3"].seconds).toBe(120);
        expect(state().accountBests?.["16x16/40"].seconds).toBe(300);
    });

    test("boards are separate records", () => {
        state().setAccountBests({ "16x16/40": { seconds: 90, players: 1, at: 1 } });

        state().recordAccountBest("9x9/10", { seconds: 30, players: 1, at: 5 });

        expect(state().accountBests?.["9x9/10"].seconds).toBe(30);
        expect(state().accountBests?.["16x16/40"].seconds).toBe(90);
    });
});

/*
 * The table that lands from the server is not always newer than what the store
 * holds: a clear finished while the fetch was in flight is only in the store.
 * Replacing wholesale would drop it and leave a stale banner until the next
 * page load.
 */
describe("hydrating from the server", () => {
    test("keeps a record the fetch was too early to know about", () => {
        state().setAccountBests({});
        state().recordAccountBest("16x16/40", { seconds: 75, players: 1, at: 9 });

        state().setAccountBests({ "9x9/10": { seconds: 30, players: 1, at: 1 } });

        expect(state().accountBests?.["16x16/40"].seconds).toBe(75);
        expect(state().accountBests?.["9x9/10"].seconds).toBe(30);
    });

    test("the server's faster record wins over what was held", () => {
        state().setAccountBests({ "16x16/40": { seconds: 90, players: 1, at: 1 } });

        state().setAccountBests({ "16x16/40": { seconds: 60, players: 1, at: 2 } });

        expect(state().accountBests?.["16x16/40"].seconds).toBe(60);
    });

    /*
     * The cost of the merge, pinned deliberately: a held record the server does
     * not have — because its write dropped, stats being best-effort — outlives
     * the fetch instead of vanishing from under the player. Both numbers come
     * off the same clock, so showing the faster is the lesser wrong. If this
     * ever needs to flip, it flips here.
     */
    test("a held record the server never got survives the fetch", () => {
        state().setAccountBests({ "16x16/40": { seconds: 90, players: 1, at: 1 } });

        state().setAccountBests({ "16x16/40": { seconds: 95, players: 1, at: 2 } });

        expect(state().accountBests?.["16x16/40"].seconds).toBe(90);
    });

    /*
     * The merge must not reach across a sign-out: whoever signs in next gets
     * the table their account holds and nothing of the previous one's.
     */
    test("nothing survives a sign-out into the next account's table", () => {
        state().setAccountBests({ "16x16/40": { seconds: 60, players: 1, at: 1 } });
        state().setAccountBests(null);

        state().setAccountBests({ "9x9/10": { seconds: 30, players: 1, at: 2 } });

        expect(state().accountBests).toEqual({ "9x9/10": { seconds: 30, players: 1, at: 2 } });
    });
});

describe("signing out", () => {
    test("drops the previous account's records rather than showing them on", () => {
        state().setAccountBests({ "16x16/40": { seconds: 90, players: 1, at: 1 } });

        state().setAccountBests(null);

        expect(state().accountBests).toBeNull();
    });
});
