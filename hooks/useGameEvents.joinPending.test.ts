// @vitest-environment jsdom
/**
 * Every reply that ends a join attempt must clear `joinPending`, or the
 * "Joining room…" indicator on Landing outlives the request it describes.
 * The clearing is spread across four handlers plus leaveRoom — exactly the
 * kind of wiring a refactor of the handler table drops silently.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMinesweeperStore } from "@/app/store";
import { SERVER_EVENTS } from "@/shared/events";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";

const fakeSocket = () => ({ id: "sock-1", emit: vi.fn() }) as unknown as AppSocket;

const state = () => useMinesweeperStore.getState();

beforeEach(() => {
    state().setJoinPending("join");
});

describe("replies that end a join attempt clear joinPending", () => {
    test.each([
        [SERVER_EVENTS.JOIN_ROOM_ERROR, undefined],
        [SERVER_EVENTS.CREATE_ROOM_ERROR, undefined],
        [SERVER_EVENTS.PVP_ROOM_FULL, undefined],
        [SERVER_EVENTS.JOIN_ROOM_SUCCESS, { room: "wired-room" }],
    ] as const)("%s clears it", (event, payload) => {
        const handlers = useGameEvents(fakeSocket(), vi.fn());
        (handlers[event] as (p: unknown) => void)(payload);

        expect(state().joinPending).toBeNull();
    });

    test("roomDoesNotExist clears it through leaveRoom", () => {
        // The handler delegates to the real leaveRoom action, which owns the
        // clear — so here the wiring under test is that the delegation happens.
        const leaveRoom = vi.fn();
        const handlers = useGameEvents(fakeSocket(), leaveRoom);
        (handlers[SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR] as () => void)();

        expect(leaveRoom).toHaveBeenCalledTimes(1);
    });
});
