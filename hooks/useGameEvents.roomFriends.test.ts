// @vitest-environment jsdom
/**
 * Where the add-friend list is asked for, and which answers are believed.
 *
 * It used to be asked for by the component that draws it — which is mounted
 * once per summary DIALOG, and dialogs in this app are always rendered rather
 * than conditionally mounted. So it fired four times, on ROOM JOIN, before
 * anybody had played anything, and each one walked the room on the server.
 *
 * The ask belongs with the OPEN. These are the tests that keep it there.
 *
 * The answers are stamped with a room because they are NOT ordered by when
 * they were asked for — each one is emitted when its Redis and Postgres work
 * finishes, so the answer for a room you have left can overtake the one for
 * the room you are in.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
/*
 * The win handler shoots confetti, and the real one schedules an animation
 * frame that outlives this file's jsdom window — the callback then finds a
 * null canvas context and throws where no test can catch it. Every test passes
 * and the run still exits 1. Mocked here for the same reason
 * useGameEvents.test.ts mocks it.
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
    // The counters deliberately outlive a room, so a clean slate per test is
    // a store reset rather than anything the app itself does.
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
    // Landing has a `room` too — whatever is being typed into the join box —
    // so `playerJoined` is what tells the two apart.
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
     * The regression: room A is asked, the player moves to room B, B answers,
     * and THEN A's answer lands. Believing it would offer somebody from the
     * previous game — and the socket id it sends with B is one the server
     * refuses, so the button is not merely wrong but dead.
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
     * The same race within ONE room, which the room guard cannot see: the
     * game-end list is asked for, the player adds somebody, the add's reply
     * lands with them as `friends` — and then the game-end reply, which read
     * Postgres before the add, arrives saying `none`. The button would go back
     * to "Add friend" under somebody who is already added, and stay wrong
     * until the next game ended.
     */
    test("for the same room does not undo a newer one", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());

        arrives(handlers, listFor("wired-room", "Alice", 2, "friends"));   // the add's reply
        arrives(handlers, listFor("wired-room", "Alice", 1, "none"));      // asked first, back last

        expect(state().roomFriends.map((p) => p.status)).toEqual(["friends"]);
    });

    /*
     * Why the check is against what we HAVE and not against what we last
     * asked: the server answers a request it refuses with silence, so an ask
     * that never comes back would strand the good answer before it.
     */
    test("is kept even when a later ask never answers", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());

        const answered = state().nextRoomFriendsToken();
        state().nextRoomFriendsToken();                    // refused; never answers

        arrives(handlers, listFor("wired-room", "Alice", answered, "friends"));

        expect(state().roomFriends.map((p) => p.status)).toEqual(["friends"]);
    });

    /*
     * And why the counters outlive the room: rejoining the one just left would
     * otherwise reuse its tokens, and an answer still in flight from the last
     * visit would be taken as this visit's — former players, offered again.
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

    test("is dropped once we are out of the room altogether", () => {
        const handlers = useGameEvents(socketWith(), vi.fn());
        state().setPlayerJoined(false);

        arrives(handlers, listFor("wired-room", "Alice"));

        expect(state().roomFriends).toEqual([]);
    });
});
