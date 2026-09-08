// @vitest-environment jsdom
/**
 * The daily replay: a resumed terminal attempt carries its FINAL board, and
 * the handler must recreate what a live finish leaves behind. jsdom because
 * this handler opens dialogs.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMinesweeperStore } from "@/app/store";
import { SERVER_EVENTS } from "@/shared/events";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";
import type { Cell } from "@/app/store";

const fakeSocket = () => ({ id: "sock-1", emit: vi.fn() }) as unknown as AppSocket;

const mine: Cell = { isMine: true, isOpen: true, isFlagged: false, nearbyMines: 0 };
const open: Cell = { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 };
const BOARD: Cell[][] = [
    [open, mine],
    [open, open],
];

const deliver = (payload: Record<string, unknown>) => {
    const handlers = useGameEvents(fakeSocket(), vi.fn());
    (handlers[SERVER_EVENTS.DAILY_ALREADY_ATTEMPTED] as (p: unknown) => void)(payload);
};

const state = () => useMinesweeperStore.getState();

beforeEach(() => {
    const store = state();
    store.setBoard([]);
    store.setGameOver(false);
    store.setGameWon(false);
    store.setDailyActive(false);
    store.setClock({ startedAt: null, endedAt: null });
});

describe("a resumed FAILED attempt with a stored board", () => {
    test("mounts the replay with mines drawable and the clock frozen at the recorded time", () => {
        deliver({
            date: "2026-08-02",
            status: "failed",
            elapsedMs: 42_000,
            board: BOARD,
            numRows: 2,
            numCols: 2,
            numMines: 1,
        });

        const store = state();
        expect(store.dailyActive).toBe(true);
        expect(store.board).toEqual(BOARD);
        expect(store.numRows).toBe(2);
        expect(store.numMines).toBe(1);
        // gameOver is what lets Cell.tsx draw a CLOSED revealed mine.
        expect(store.gameOver).toBe(true);
        expect(store.gameWon).toBe(false);
        // The frozen clock reads exactly the recorded run length.
        expect(store.endedAt! - store.startedAt!).toBe(42_000);
    });
});

describe("a resumed COMPLETED attempt", () => {
    test("mounts as a won board, not a lost one", () => {
        deliver({
            date: "2026-08-02",
            status: "completed",
            elapsedMs: 10_000,
            rank: 3,
            totalEntries: 9,
            board: BOARD,
            numRows: 2,
            numCols: 2,
            numMines: 1,
        });

        const store = state();
        expect(store.board).toEqual(BOARD);
        expect(store.gameWon).toBe(true);
        expect(store.gameOver).toBe(false);
        expect(store.dailyRank).toBe(3);
    });
});

describe("an attempt from before replays existed (no stored board)", () => {
    test("clears any stale board instead of showing someone else's", () => {
        state().setBoard(BOARD); // e.g. left over from a room this session
        deliver({ date: "2026-08-02", status: "failed", elapsedMs: 5_000 });

        expect(state().board).toEqual([]);
        expect(state().dailyActive).toBe(true);
        expect(state().dailyStatus).toBe("failed");
    });
});
