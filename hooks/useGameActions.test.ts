// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { CLIENT_EVENTS } from "@/shared/events";
import { cellActionSound, useGameActions } from "./useGameActions";
import type { AppSocket } from "@/lib/initSocket";

/**
 * What leaving has to put back, and what a refused action must not assume.
 * `recordClear` in useGameEvents treats a set clock as proof of a run, so a
 * stale one filed the previous game's time as a best for a board never played.
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

    /* The roster sizes the group a best time is filed under; stale, Landing shows a group record for a solo board. */
    test("forgets the roster, so the landing page reads as solo", () => {
        act(() => {
            state().setPlayerStatsInRoom([
                { name: "Alice", score: 1 },
                { name: "Bob", score: 2 },
            ]);
        });

        const { leaveRoom } = actions();
        act(() => leaveRoom());

        expect(state().playerStatsInRoom).toEqual([]);
    });

    /* A one-shot arm left standing is spent on the next room's first click, invisibly. */
    test("disarms the ping, so the next room's first click plays its cell", () => {
        act(() => {
            state().setMode("co-op");
            state().setPingArmed(true);
        });

        const { leaveRoom } = actions();
        act(() => leaveRoom());

        expect(state().pingArmed).toBe(false);
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
    /* `gameOver` clears optimistically, so it must follow the server's refusal rule. */
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

/** A blip must accompany only actions the server will accept; anything else is false feedback. */
describe("cellActionSound", () => {
    const closed = { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 };
    const open = { ...closed, isOpen: true };
    const flagged = { ...closed, isFlagged: true };

    beforeEach(() => {
        act(() => state().setBoard([[closed, open, flagged]]));
    });

    test("reveal only on a closed, unflagged cell", () => {
        expect(cellActionSound(false, false, 0, 0)).toBe("reveal");
        expect(cellActionSound(false, false, 0, 1)).toBeNull(); // open
        expect(cellActionSound(false, false, 0, 2)).toBeNull(); // flag-protected
    });

    test("flag/unflag only on closed cells", () => {
        expect(cellActionSound(true, false, 0, 0)).toBe("flag");
        expect(cellActionSound(true, false, 0, 2)).toBe("unflag");
        expect(cellActionSound(true, false, 0, 1)).toBeNull(); // open
    });

    test("chord only on an open cell — the only place it does anything", () => {
        expect(cellActionSound(false, true, 0, 1)).toBe("chord");
        expect(cellActionSound(false, true, 0, 0)).toBeNull();
    });

    test("off-board coordinates are silent, not a crash", () => {
        expect(cellActionSound(false, false, 9, 9)).toBe("reveal"); // unknown cell: benign default
        expect(cellActionSound(true, false, 9, 9)).toBe("flag");
    });
});

/**
 * The optimistic flag, the only action the client can resolve itself. These
 * pin the refusal side: the server answers a refused action with silence, so
 * a flag drawn on a rejected cell is never taken back.
 */
describe("flagging before the server answers", () => {
    const closed = { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 };
    const open = { ...closed, isOpen: true };

    const flagged = (row: number, col: number) => state().board[row][col].isFlagged;

    beforeEach(() => {
        act(() => {
            state().setBoard([[{ ...closed }, { ...open }]]);
            state().setGameOver(false);
            state().setGameWon(false);
            state().setMode("co-op");
            state().setPvpWinner(null);
        });
    });

    test("the flag is on the board before the socket has replied", () => {
        const { toggleFlag } = actions();

        act(() => toggleFlag(0, 0));

        expect(flagged(0, 0)).toBe(true);
    });

    test("flagging again takes it off", () => {
        const { toggleFlag } = actions();

        act(() => toggleFlag(0, 0));
        act(() => toggleFlag(0, 0));

        expect(flagged(0, 0)).toBe(false);
    });

    test("an open cell is left alone — the server refuses those", () => {
        const { toggleFlag } = actions();

        act(() => toggleFlag(0, 1));

        expect(flagged(0, 1)).toBe(false);
    });

    /* A finished board still has closed cells the server will never touch again. */
    test("a finished game takes no more flags", () => {
        act(() => state().setGameOver(true));

        const { toggleFlag } = actions();
        act(() => toggleFlag(0, 0));

        expect(flagged(0, 0)).toBe(false);
    });

    test("nor does a won one", () => {
        act(() => state().setGameWon(true));

        const { toggleFlag } = actions();
        act(() => toggleFlag(0, 0));

        expect(flagged(0, 0)).toBe(false);
    });

    test("a race that has not started yet takes none either", () => {
        act(() => {
            state().setMode("pvp");
            state().setPvpStarted(false);
        });

        const { toggleFlag } = actions();
        act(() => toggleFlag(0, 0));

        expect(flagged(0, 0)).toBe(false);
    });

    test("nor does a race someone has already won", () => {
        act(() => {
            state().setMode("pvp");
            state().setPvpStarted(true);
            state().setPvpWinner("Someone else");
        });

        const { toggleFlag } = actions();
        act(() => toggleFlag(0, 0));

        expect(flagged(0, 0)).toBe(false);
    });

    test("the emit still goes out — the server remains the authority", () => {
        const socket = fakeSocket();

        actions(socket).toggleFlag(0, 0);

        expect(socket.emit).toHaveBeenCalledWith(
            CLIENT_EVENTS.TOGGLE_FLAG,
            expect.objectContaining({ row: 0, col: 0 }),
        );
    });

    /* The server's broadcast must overrule the guess, including back to unflagged. */
    test("the server's answer overrules the guess", () => {
        const { toggleFlag } = actions();
        act(() => toggleFlag(0, 0));

        act(() => state().setCells([{ ...closed, isFlagged: false, row: 0, col: 0 }]));

        expect(flagged(0, 0)).toBe(false);
    });
});

/** A settled daily attempt refuses moves client-side: the server would anyway, and a blip would be false feedback. */
describe("daily actions on a terminal attempt", () => {
    beforeEach(() => {
        act(() => {
            state().setDailyActive(true);
            state().setBoard([[{ isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }]]);
        });
        localStorage.setItem(
            "minesweeper_daily_identity",
            JSON.stringify({ date: "2020-01-01", token: "tok-test" }),
        );
    });

    test.each(["failed", "won_pending_submit", "completed"] as const)(
        "status %s: opening a cell emits nothing",
        (status) => {
            act(() => state().setDailyStatus(status));
            const socket = fakeSocket();
            actions(socket).dailyOpenCell(0, 0);
            expect((socket.emit as ReturnType<typeof vi.fn>).mock.calls).toEqual([]);
        },
    );

    test("an in_progress attempt still emits — the gate is terminal-only", () => {
        act(() => state().setDailyStatus("in_progress"));
        const socket = fakeSocket();
        actions(socket).dailyOpenCell(0, 0);
        expect(
            (socket.emit as ReturnType<typeof vi.fn>).mock.calls.some(
                ([event]) => event === CLIENT_EVENTS.DAILY_OPEN_CELL,
            ),
        ).toBe(true);
    });
});

describe("pingCell", () => {
    beforeEach(() => {
        act(() => {
            state().setRoom("room-1");
            state().setMode("co-op");
            state().setPingArmed(true);
        });
    });

    test("emits the cell it was given", () => {
        const socket = fakeSocket();
        const { pingCell } = actions(socket);

        act(() => pingCell(2, 5));

        expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.PING_CELL, { room: "room-1", row: 2, col: 5 });
    });

    test("disarms after one ping — the arm is one-shot", () => {
        const { pingCell } = actions();

        act(() => pingCell(2, 5));

        expect(state().pingArmed).toBe(false);
    });

    /* Left armed by a refusal, the next click would not play its cell. */
    test("disarms even when there is no socket to send on", () => {
        const { pingCell } = actions(null);

        act(() => pingCell(2, 5));

        expect(state().pingArmed).toBe(false);
    });

    test("disarms even in PVP, where it never emits", () => {
        const socket = fakeSocket();
        act(() => state().setMode("pvp"));
        const { pingCell } = actions(socket);

        act(() => pingCell(2, 5));

        expect(socket.emit).not.toHaveBeenCalled();
        expect(state().pingArmed).toBe(false);
    });
});
