import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMinesweeperStore } from "@/app/store";
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";

/**
 * `sessionResume` — the offer the server makes to a browser it recognises.
 *
 * It arrives on EVERY connect, and the two connects it has to tell apart look
 * nothing alike from the client's side:
 *
 *   a reload      — the tab restarted, so the store is empty and the player is
 *                   sitting on Landing
 *   a reconnect   — socket.io re-dialled after a dropped network, and the tab
 *                   never went anywhere: the room is still on screen
 *
 * Only the first was handled. The second was refused because `playerJoined` was
 * still true, which left the player stranded — the server had already removed
 * them on the disconnect, so the UI showed a room they were no longer in and
 * the next click bounced them home with "room does not exist". The tests below
 * are about the refusal being narrow enough: it must still cover the daily, and
 * still cover an offer for some OTHER room.
 *
 * Pure logic, no DOM: the handler table is a plain object, so a fake socket and
 * the real store are the whole fixture.
 */

const ROOM = "room-a";
const NAME = "Alice";

const fakeSocket = () => ({ id: "sock-1", emit: vi.fn() }) as unknown as AppSocket;

/** Delivers one `sessionResume` through the real handler table. */
const deliverResume = (socket: AppSocket, payload: { room: string; name: string }) => {
    const handlers = useGameEvents(socket, vi.fn());
    handlers[SERVER_EVENTS.SESSION_RESUME]!(payload);
};

const joinEmits = (socket: AppSocket) =>
    (socket.emit as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([event]) => event === CLIENT_EVENTS.JOIN_ROOM,
    );

beforeEach(() => {
    const store = useMinesweeperStore.getState();
    store.setPlayerJoined(false);
    store.setDailyActive(false);
    store.setRoom("");
    store.setName("");
});

describe("when the browser is not in a room", () => {
    test("takes the offer, by running the ordinary join", () => {
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([[CLIENT_EVENTS.JOIN_ROOM, { room: ROOM, name: NAME }]]);
        expect(useMinesweeperStore.getState().room).toBe(ROOM);
        expect(useMinesweeperStore.getState().name).toBe(NAME);
    });
});

describe("when the tab is still showing the room the offer names", () => {
    /*
     * The reconnect case. Refusing here was the bug: the server has already
     * dropped this player, so doing nothing leaves the two halves disagreeing
     * about whether they are in the room, and only the next click reveals it.
     */
    test("re-joins, rather than assuming the room is still theirs", () => {
        const store = useMinesweeperStore.getState();
        store.setPlayerJoined(true);
        store.setRoom(ROOM);
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([[CLIENT_EVENTS.JOIN_ROOM, { room: ROOM, name: NAME }]]);
    });
});

describe("when the offer is not for the room on screen", () => {
    test("ignores an offer for a different room", () => {
        const store = useMinesweeperStore.getState();
        store.setPlayerJoined(true);
        store.setRoom("room-b");
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([]);
        expect(useMinesweeperStore.getState().room).toBe("room-b");
    });

    test("ignores an offer while the daily challenge is open", () => {
        // Picking the daily is a real choice. Accepting here would set
        // playerJoined behind the daily view, and the player would land in an
        // old room the moment they left it.
        useMinesweeperStore.getState().setDailyActive(true);
        const socket = fakeSocket();

        deliverResume(socket, { room: ROOM, name: NAME });

        expect(joinEmits(socket)).toEqual([]);
        expect(useMinesweeperStore.getState().playerJoined).toBe(false);
    });
});
