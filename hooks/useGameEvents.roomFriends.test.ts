// @vitest-environment jsdom
/**
 * Where the add-friend list is asked for, and which answers are believed. The
 * ask belongs with the dialog OPEN, not the component that draws the list:
 * dialogs are always rendered, so a component-owned ask fired four times on
 * room join. Answers are stamped with a room because they are ordered by when
 * their Redis/Postgres work finishes, not by when they were asked for.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
/*
 * The real confetti schedules an animation frame that outlives jsdom's window
 * and throws where no test can catch it. Mocked as in useGameEvents.test.ts.
 */
vi.mock("@/lib/confetti", () => ({ shootConfetti: vi.fn() }));

import { useMinesweeperStore } from "@/app/store";
import type { RoomFriend } from "@/state/friendsSlice";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";

const socketWith = (emit = vi.fn()) => ({ id: "sock-me", emit }) as unknown as AppSocket;
const state = () => useMinesweeperStore.getState();

const asks = (emit: ReturnType<typeof vi.fn>) =>
    emit.mock.calls.filter(([event]) => event === CLIENT_EVENTS.ROOM_FRIENDS);

const listFor = (room: string, name: string, token = 1, status: RoomFriend["status"] = "none") => ({
    room,
    token,
    players: [{ id: `sock-${name}`, name, avatar: null, status }],
});

const arrives = (handlers: ReturnType<typeof useGameEvents>, payload: unknown) =>
    (handlers[SERVER_EVENTS.ROOM_FRIENDS_UPDATE] as (p: unknown) => void)(payload);

beforeEach(() => {
    state().setRoom("wired-room");
    state().setPlayerJoined(true);
    state().setMode("co-op");
    // The counters outlive a room, so the clean slate is a store reset.
    useMinesweeperStore.setState({ roomFriends: [], roomFriendsToken: 0, roomFriendsSeen: 0 });
});

describe("a game ending", () => {
    test.each([
        [SERVER_EVENTS.GAME_WON, undefined],
        [SERVER_EVENTS.GAME_OVER, "Someone"],
    ] as const)("%s asks exactly once", (event, payload) => {
        const emit = vi.fn();
        const handlers = useGameEvents(socketWith(emit), vi.fn());

        (handlers[event] as (p: unknown) => void)(payload);

        expect(asks(emit)).toEqual([
            [CLIENT_EVENTS.ROOM_FRIENDS, { room: "wired-room", token: expect.any(Number) }],
        ]);
    });

    test("the race's endings ask too", () => {
        const emit = vi.fn();
        const handlers = useGameEvents(socketWith(emit), vi.fn());
        state().setMode("pvp");

        (handlers[SERVER_EVENTS.PVP_GAME_OVER] as () => void)();

        expect(asks(emit)).toHaveLength(1);
    });
});

describe("not in a room", () => {
    // Landing has a `room` too (the join box), so `playerJoined` tells them apart.
    test("nothing is asked", () => {
        const emit = vi.fn();
        state().setPlayerJoined(false);
        const handlers = useGameEvents(socketWith(emit), vi.fn());

        (handlers[SERVER_EVENTS.GAME_WON] as () => void)();

        expect(asks(emit)).toEqual([]);
    });
});

describe("a list arriving", () => {
    test("is believed when it is about the room we are in", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());

        arrives(handlers, listFor("wired-room", "Alice"));

        expect(state().roomFriends.map((p) => p.name)).toEqual(["Alice"]);
    });

    /*
     * The regression: room A is asked, the player moves to B, B answers, THEN
     * A's answer lands. Believing it offers somebody from the previous game.
     */
    test("for a room we have left does not overwrite the one we are in", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());

        arrives(handlers, listFor("room-a", "Alice", 1));   // asked for before the move
        state().setRoom("room-b");
        arrives(handlers, listFor("room-b", "Bob", 2));
        arrives(handlers, listFor("room-a", "Alice", 3));   // A's answer, overtaken

        expect(state().roomFriends.map((p) => p.name)).toEqual(["Bob"]);
    });

    /*
     * The same race within ONE room, invisible to the room guard: the add's
     * reply lands as `friends`, then the older game-end reply arrives saying
     * `none` and puts "Add friend" back under somebody already added.
     */
    test("for the same room does not undo a newer one", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());

        arrives(handlers, listFor("wired-room", "Alice", 2, "friends"));   // the add's reply
        arrives(handlers, listFor("wired-room", "Alice", 1, "none"));      // asked first, back last

        expect(state().roomFriends.map((p) => p.status)).toEqual(["friends"]);
    });

    /*
     * Checked against what we HAVE, not what we last asked: a refused request
     * is answered with silence, which would strand the good answer before it.
     */
    test("is kept even when a later ask never answers", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());

        const answered = state().nextRoomFriendsToken();
        state().nextRoomFriendsToken();                    // refused; never answers

        arrives(handlers, listFor("wired-room", "Alice", answered, "friends"));

        expect(state().roomFriends.map((p) => p.status)).toEqual(["friends"]);
    });

    /*
     * Why the counters outlive the room: rejoining would otherwise reuse its
     * tokens, and an answer still in flight from the last visit would pass.
     */
    test("from a previous visit to the same room is dropped", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());

        const first = state().nextRoomFriendsToken();
        arrives(handlers, listFor("wired-room", "Gone", first, "none"));

        state().resetRoomFriends();                        // the visit ends
        const second = state().nextRoomFriendsToken();     // and begins again
        expect(second).toBeGreaterThan(first);

        arrives(handlers, listFor("wired-room", "Gone", first, "none"));

        expect(state().roomFriends).toEqual([]);
    });

    /*
     * The visit ended with its ask unanswered, so `seen` never rose to meet it.
     * Leaving has to retire the ask itself.
     */
    test("from a previous visit that never answered is dropped", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());

        const stranded = state().nextRoomFriendsToken();   // asked, never answered
        state().resetRoomFriends();                        // the visit ends

        arrives(handlers, listFor("wired-room", "Gone", stranded, "none"));

        expect(state().roomFriends).toEqual([]);

        // and this visit's own answer is still taken
        const mine = state().nextRoomFriendsToken();
        arrives(handlers, listFor("wired-room", "Here", mine, "none"));

        expect(state().roomFriends.map((p) => p.name)).toEqual(["Here"]);
    });

    test("is dropped once we are out of the room altogether", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());
        state().setPlayerJoined(false);

        arrives(handlers, listFor("wired-room", "Alice"));

        expect(state().roomFriends).toEqual([]);
    });
});
