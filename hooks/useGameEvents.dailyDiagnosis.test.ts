// @vitest-environment jsdom
/**
 * DAILY_BOARD_UPDATE must diagnose the loss from the PRE-loss position (the
 * store's board before this payload lands), not the payload's board. The two
 * fixtures are built to disagree, so setBoard before diagnoseLoss is visibly wrong.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useMinesweeperStore } from "@/app/store";
import { SERVER_EVENTS } from "@/shared/events";
import { useGameEvents } from "./useGameEvents";
import type { AppSocket } from "@/lib/initSocket";
import type { Cell } from "@/app/store";

vi.mock("@/lib/confetti", () => ({ shootConfetti: vi.fn() }));

const fakeSocket = () => ({ id: "sock-1", emit: vi.fn() }) as unknown as AppSocket;

const deliver = (board: Cell[][]) => {
    const handlers = useGameEvents(fakeSocket(), vi.fn());
    (handlers[SERVER_EVENTS.DAILY_BOARD_UPDATE] as (p: { board: Cell[][] }) => void)({ board });
};

const state = () => useMinesweeperStore.getState();

beforeEach(() => {
    const store = state();
    store.setBoard([]);
    store.setDailyDiagnosis(null);
    store.setGameOver(false);
    store.setGameWon(false);
});

/*
 * A 1 with exactly one covered neighbour, which the player opened: the mine
 * was provable by counting (same fixture as lib/lossDiagnosis.test.ts).
 *   1 #
 *   . .
 */
const preLoss: Cell[][] = [
    [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }, { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }],
    [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }, { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }],
];

/* The same position after the fatal move: (0,1) is the open, detonated mine.
   Diagnosed from THIS board, the opened mine reads as a blank digit and the
   result is a different diagnosis entirely. */
const revealed: Cell[][] = [
    [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }, { isMine: true, isOpen: true, isFlagged: false, nearbyMines: 0 }],
    [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }, { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }],
];

describe("a losing update (one open mine)", () => {
    test("diagnoses from the PRE-loss position, not the payload's own board", () => {
        state().setBoard(preLoss);

        deliver(revealed);

        const diagnosis = state().dailyDiagnosis;
        expect(diagnosis?.kind).toBe("provable-mine");
        expect(diagnosis?.lesson).toBe("counting");
        expect(diagnosis?.target).toEqual([0, 1]);
        expect(diagnosis?.verdict).toBe("mine");
    });

    test("still mounts the revealed board", () => {
        state().setBoard(preLoss);

        deliver(revealed);

        expect(state().board).toEqual(revealed);
    });
});

describe("a winning update (mines flagged, none open)", () => {
    test("produces no diagnosis", () => {
        const won: Cell[][] = [
            [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }, { isMine: true, isOpen: false, isFlagged: true, nearbyMines: 0 }],
            [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }, { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }],
        ];
        state().setBoard(preLoss);

        deliver(won);

        expect(state().dailyDiagnosis).toBeNull();
    });
});

describe("a normal mid-game update (nothing open is a mine)", () => {
    test("produces no diagnosis", () => {
        const midGame: Cell[][] = [
            [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }, { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }],
            [{ isMine: false, isOpen: true, isFlagged: false, nearbyMines: 1 }, { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 }],
        ];
        state().setBoard(preLoss);

        deliver(midGame);

        expect(state().dailyDiagnosis).toBeNull();
    });
});
