// @vitest-environment jsdom
/**
 * The RECEIVE side of a reaction, which `settings.emotes` governs. Applied in
 * the handler, not the component: an opted-out player should accumulate no
 * feed state and hear no blip.
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
const receive = (payload: { id: string; name: string; emote: string; room?: string }) => {
    const handlers = useGameEvents(fakeSocket(), vi.fn());
    (handlers[SERVER_EVENTS.PLAYER_EMOTE] as (p: unknown) => void)({ room: ROOM, ...payload });
};

beforeEach(() => {
    state().clearPlayerEmotes();
    state().setSetting("emotes", true);
    // `leftARoom` latches for the session, and the store is shared across tests.
    useMinesweeperStore.setState({ leftARoom: false });
    // A reaction is scoped to a room, so the receiver has to be IN one.
    state().setRoom(ROOM);
    state().setPlayerJoined(true);
});

describe("an incoming reaction", () => {
    test("lands in the feed with its sender", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        expect(state().playerEmotes).toHaveLength(1);
        expect(state().playerEmotes[0]).toMatchObject({ id: "sock-alex", name: "Alex", emote: "nice" });
    });

    test("carries a deadline in the future", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        expect(state().playerEmotes[0].expiresAt).toBeGreaterThan(Date.now());
    });

    // The server sends to the whole room, sender included.
    test("from yourself lands too", () => {
        receive({ id: "sock-me", name: "Me", emote: "wave" });

        expect(state().playerEmotes).toHaveLength(1);
    });

    test("gets a distinct key per message, so repeats stack", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        const [first, second] = state().playerEmotes;
        expect(first.key).not.toBe(second.key);
    });

    /* Dropping an emote this build cannot draw is the same refusal emoteArtById makes. */
    test("this build cannot draw is dropped", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "not-an-emote" });

        expect(state().playerEmotes).toEqual([]);
    });
});

describe("with reactions switched off", () => {
    beforeEach(() => state().setSetting("emotes", false));

    test("nothing reaches the feed", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        expect(state().playerEmotes).toEqual([]);
    });

    /* "No reactions on my screen" includes your own, or you emote into what you believe is a quiet room. */
    test("not even your own", () => {
        receive({ id: "sock-me", name: "Me", emote: "wave" });

        expect(state().playerEmotes).toEqual([]);
    });
});

describe("a reaction from a room this browser is no longer in", () => {
    /*
     * The server broadcast before the leave was processed and the socket
     * outlives the room. Without the room on the payload this lands in the
     * NEXT room's feed under a name nobody there recognises.
     */
    test("does not land in the room joined next", () => {
        state().setRoom("room-b");

        receive({ id: "sock-alex", name: "Alex", emote: "nice", room: "room-a" });

        expect(state().playerEmotes).toEqual([]);
    });

    // Still on Landing, joined to nothing. `room` also holds what is being TYPED
    // into the join form, so the code alone matches again mid-keystroke.
    test("does not land while typing that room's code on Landing", () => {
        state().setPlayerJoined(false);

        receive({ id: "sock-alex", name: "Alex", emote: "nice" });

        expect(state().playerEmotes).toEqual([]);
    });
});

/*
 * Frontend and server deploy from `main` independently, so a new client spends
 * a deploy talking to a server that does not send `room` yet.
 */
describe("a reaction from a server too old to send the room", () => {
    test("lands while this browser has only ever been in this room", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice", room: undefined });

        expect(state().playerEmotes.map((e) => e.name)).toEqual(["Alex"]);
    });

    /*
     * Why the fallback is latched: a stale relay can only arrive AFTER a leave,
     * so once one has happened a roomless payload is no longer provably from
     * the room on screen.
     */
    test("is refused once this browser has left a room, even back in one", () => {
        state().setPlayerJoined(false);   // left room-a
        state().setRoom("room-b");
        state().setPlayerJoined(true);    // and joined room-b

        receive({ id: "sock-alex", name: "Alex", emote: "nice", room: undefined });

        expect(state().playerEmotes).toEqual([]);
    });

    // No room on the payload is not a reason to draw on a board this browser is not at.
    test("is still refused when this browser is in no room at all", () => {
        state().setPlayerJoined(false);

        receive({ id: "sock-alex", name: "Alex", emote: "nice", room: undefined });

        expect(state().playerEmotes).toEqual([]);
    });

    // A payload that NAMES another room is refused whatever the history.
    test("does not soften the check for a payload that names another room", () => {
        receive({ id: "sock-alex", name: "Alex", emote: "nice", room: "room-a" });
        expect(state().playerEmotes.map((e) => e.name)).toEqual(["Alex"]);

        state().setRoom("room-b");
        receive({ id: "sock-jo", name: "Jo", emote: "nice", room: "room-a" });
        expect(state().playerEmotes.map((e) => e.name)).toEqual(["Alex"]);
    });
});

describe("the feed is bounded", () => {
    // The display half of the rate limit: an unbounded feed lets one player push everyone else's off screen.
    test("keeps only the most recent few", () => {
        for (let i = 0; i < 8; i++) receive({ id: `sock-${i}`, name: `P${i}`, emote: "nice" });

        expect(state().playerEmotes.length).toBeLessThanOrEqual(3);
        expect(state().playerEmotes.at(-1)?.name).toBe("P7");
    });
});
