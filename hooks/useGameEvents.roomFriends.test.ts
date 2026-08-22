// @vitest-environment jsdom
/**
 * Where the add-friend list is asked for.
 *
 * It used to be asked for by the component that draws it — which is mounted
 * once per summary DIALOG, and dialogs in this app are always rendered rather
 * than conditionally mounted. So it fired four times, on ROOM JOIN, before
 * anybody had played anything, and each one walked the room on the server.
 *
 * The ask belongs with the OPEN. These are the tests that keep it there.
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
import { CLIENT_EVENTS, SERVER_EVENTS } from "@/shared/events";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";

const socketWith = (emit = vi.fn()) => ({ id: "sock-me", emit }) as unknown as AppSocket;
const state = () => useMinesweeperStore.getState();

const asks = (emit: ReturnType<typeof vi.fn>) =>
    emit.mock.calls.filter(([event]) => event === CLIENT_EVENTS.ROOM_FRIENDS);

beforeEach(() => {
    state().setRoom("wired-room");
    state().setPlayerJoined(true);
    state().setMode("co-op");
});

describe("a game ending", () => {
    test.each([
        [SERVER_EVENTS.GAME_WON, undefined],
        [SERVER_EVENTS.GAME_OVER, "Someone"],
    ] as const)("%s asks exactly once", (event, payload) => {
        const emit = vi.fn();
        const handlers = useGameEvents(socketWith(emit), vi.fn());

        (handlers[event] as (p: unknown) => void)(payload);

        expect(asks(emit)).toEqual([[CLIENT_EVENTS.ROOM_FRIENDS, { room: "wired-room" }]]);
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
