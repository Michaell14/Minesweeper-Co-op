/**
 * Presence state. It mirrors something the SERVER derives from live sockets,
 * so the two rules worth pinning are that a snapshot replaces and a delta only
 * nudges — and that a delta which changes nothing changes nothing, since this
 * set is read on every render of the invite dialog.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useMinesweeperStore } from "@/app/store";

const state = () => useMinesweeperStore.getState();

beforeEach(() => {
    state().setOnlineFriends([]);
    state().setFriendInvite(null);
});

describe("the snapshot", () => {
    it("replaces whatever was there", () => {
        state().setOnlineFriends(["a", "b"]);
        state().setOnlineFriends(["c"]);
        expect(state().onlineFriendIds).toEqual(["c"]);
    });

    // A reconnect can deliver a snapshot the client has already partly seen.
    it("drops duplicates", () => {
        state().setOnlineFriends(["a", "a", "b"]);
        expect(state().onlineFriendIds).toEqual(["a", "b"]);
    });
});

describe("a delta", () => {
    it("adds and removes one friend", () => {
        state().setOnlineFriends(["a"]);
        state().setFriendOnline("b", true);
        expect(state().onlineFriendIds.sort()).toEqual(["a", "b"]);

        state().setFriendOnline("a", false);
        expect(state().onlineFriendIds).toEqual(["b"]);
    });

    /*
     * Identity is the assertion, not the contents: this set is read during
     * render, and a no-op write that returned a new array would re-render the
     * dialog every time any friend's tab count changed without their presence
     * changing.
     */
    it("that changes nothing leaves the array alone", () => {
        state().setOnlineFriends(["a"]);
        const before = state().onlineFriendIds;

        state().setFriendOnline("a", true);      // already online
        state().setFriendOnline("zzz", false);   // was never online

        expect(state().onlineFriendIds).toBe(before);
    });
});
