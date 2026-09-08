// @vitest-environment jsdom
/**
 * The RECEIVE side of a ping. The rule worth the file: a ping is scoped to ONE
 * room, since the relay outlives the membership that produced it.
 * `PingLayer.test.tsx` covers what the ring looks like once let through.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMinesweeperStore } from "@/app/store";
import { SERVER_EVENTS } from "@/shared/events";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";

const fakeSocket = () => ({ id: "sock-me", emit: vi.fn() }) as unknown as AppSocket;
const state = () => useMinesweeperStore.getState();

const ROOM = "room-a";

/** Defaults to the room this browser is in, which is the ordinary case. */
const receive = (payload: { id: string; name: string; row: number; col: number; room?: string }) => {
    const handlers = useGameEvents(fakeSocket(), vi.fn());
    (handlers[SERVER_EVENTS.PLAYER_PING] as (p: unknown) => void)({ room: ROOM, ...payload });
};

beforeEach(() => {
    state().clearPlayerPings();
    state().setSetting("emotes", true);
    state().setRoom(ROOM);
    state().setPlayerJoined(true);
});

describe("an incoming ping", () => {
    test("lands on the cell it names, with its sender", () => {
        receive({ id: "sock-alex", name: "Alex", row: 3, col: 4 });

        expect(state().playerPings).toHaveLength(1);
        expect(state().playerPings[0]).toMatchObject({ id: "sock-alex", name: "Alex", row: 3, col: 4 });
    });

    test("carries a deadline in the future, so it clears itself", () => {
        receive({ id: "sock-alex", name: "Alex", row: 3, col: 4 });

        expect(state().playerPings[0].expiresAt).toBeGreaterThan(Date.now());
    });

    /*
     * Gated on the same preference as reactions: "show me what other players
     * send" is one setting.
     */
    test("is refused when reactions are switched off", () => {
        state().setSetting("emotes", false);

        receive({ id: "sock-alex", name: "Alex", row: 3, col: 4 });

        expect(state().playerPings).toEqual([]);
    });
});

describe("a ping from a room this browser is no longer in", () => {
    /*
     * The bug this guard exists for: a ping broadcast while the socket was
     * still in room A is delivered after the leave, and `leaveRoom` cannot
     * refuse what has not arrived, so the ring landed on room B's board.
     */
    test("does not draw on the room joined next", () => {
        state().setRoom("room-b");

        receive({ id: "sock-alex", name: "Alex", row: 1, col: 2, room: "room-a" });

        expect(state().playerPings).toEqual([]);
    });

    // Still on Landing, joined to nothing: `room` also holds what is being
    // TYPED into the join form, so the code alone matches mid-keystroke.
    test("does not draw while typing that room's code on Landing", () => {
        state().setPlayerJoined(false);

        receive({ id: "sock-alex", name: "Alex", row: 1, col: 2 });

        expect(state().playerPings).toEqual([]);
    });

    // The guard must not cost the ordinary case: same room, still joined.
    test("but a ping from the current room still draws", () => {
        receive({ id: "sock-alex", name: "Alex", row: 1, col: 2 });

        expect(state().playerPings).toHaveLength(1);
    });
});
