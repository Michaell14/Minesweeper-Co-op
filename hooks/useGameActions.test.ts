// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { CLIENT_EVENTS } from "@/shared/events";
import { useGameActions } from "./useGameActions";
import type { AppSocket } from "@/lib/initSocket";

/**
 * What LEAVING has to put back, and what a refused action must not assume.
 *
 * The run clock is the record of the run this browser played, and `recordClear`
 * in useGameEvents treats a set one as proof there was a run to record. Left
 * standing across a leave, joining a room whose game was already WON filed the
 * previous game's time as a personal best for a board this browser never played
 * — the server catches an arriving player up with `gameWon`, and the handler had
 * a stale clock to read. Nothing about that is visible: the record simply
 * appears, attached to the wrong board.
 */

const fakeSocket = () => ({ id: "sock-1", emit: vi.fn() }) as unknown as AppSocket;

const actions = (socket: AppSocket | null = fakeSocket()) =>
    renderHook(() => useGameActions(socket)).result.current;

const state = () => useMinesweeperStore.getState();

beforeEach(() => {
    act(() => {
        state().setClock({ startedAt: 1_000, endedAt: 61_000 });
        state().setPlayerJoined(true);
        state().setDailyActive(false);
    });
});

describe("leaveRoom", () => {
    test("clears the run clock, so no later win inherits this one's time", () => {
        const leave = actions().leaveRoom;

        act(() => leave());

        expect(state().startedAt).toBeNull();
        expect(state().endedAt).toBeNull();
    });

    test("still leaves the room", () => {
        const socket = fakeSocket();

        const { leaveRoom } = actions(socket);
        act(() => leaveRoom());

        const emitted = (socket.emit as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
            ([event]) => event,
        );
        expect(emitted).toContain(CLIENT_EVENTS.PLAYER_LEAVE);
        expect(state().playerJoined).toBe(false);
    });
});

describe("leaveDaily", () => {
    test("clears the run clock for the same reason", () => {
        act(() => {
            state().setDailyActive(true);
        });

        const { leaveDaily } = actions();
        act(() => leaveDaily());

        expect(state().startedAt).toBeNull();
        expect(state().endedAt).toBeNull();
        expect(state().dailyActive).toBe(false);
    });
});

describe("resetMyBoard", () => {
    /*
     * Nothing confirms a reset, so `gameOver` is cleared optimistically — which
     * has to follow the same rule the SERVER refuses on. It rejects a reset once
     * the race has a winner, and clearing anyway left a board that looked
     * playable and ignored every click.
     */
    test("does nothing once the race has been won", () => {
        const socket = fakeSocket();
        act(() => {
            state().setGameOver(true);
            state().setPvpWinner("Someone else");
        });

        const { resetMyBoard } = actions(socket);
        act(() => resetMyBoard());

        expect(socket.emit).not.toHaveBeenCalled();
        expect(state().gameOver).toBe(true);
    });

    test("resets while the race is still on", () => {
        const socket = fakeSocket();
        act(() => {
            state().setGameOver(true);
            state().setPvpWinner(null);
        });

        const { resetMyBoard } = actions(socket);
        act(() => resetMyBoard());

        expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.RESET_MY_BOARD, expect.anything());
        expect(state().gameOver).toBe(false);
    });
});
