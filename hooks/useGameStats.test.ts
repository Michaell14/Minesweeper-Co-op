// @vitest-environment jsdom

/**
 * One progress percentage, correct in every mode.
 *
 * `pvpTotalSafeCells` is set by the server and only in PVP, so dividing by it
 * gave 0% everywhere else — and a bar pinned at 0% looks like a player who has
 * not started rather than a broken denominator. Each caller worked around it by
 * computing the percentage again from the board, and three of them had:
 * GameSummary inline, PracticeProgress via a second field on this hook, and the
 * hook itself.
 *
 * So the denominator falls back to the board's own count, and the workarounds
 * are gone. These pin both halves of that: the fallback works, and it does NOT
 * override the server's number in a real race.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { useGameStats } from './useGameStats';
import type { Cell } from '@/shared/socketPayloads';

const cell = (over: Partial<Cell> = {}): Cell => ({
    isMine: false,
    isOpen: false,
    isFlagged: false,
    nearbyMines: 0,
    ...over,
});

/** A 1x`size` board with `open` safe cells revealed and one mine. */
const board = (size: number, open: number) =>
    [Array.from({ length: size }, (_, i) =>
        i === size - 1 ? cell({ isMine: true }) : cell({ isOpen: i < open }))];

const stats = () => renderHook(() => useGameStats()).result.current;

beforeEach(() => {
    act(() => {
        // 10 cells, 1 mine -> 9 safe. 3 of them open.
        useMinesweeperStore.getState().setBoard(board(10, 3));
        useMinesweeperStore.getState().setDimensions(1, 10, 1);
        useMinesweeperStore.getState().setPvpTotalSafeCells(0);
        useMinesweeperStore.getState().setPvpOpponentProgress(0);
    });
});

describe('progress without a server total', () => {
    test('counts against the board, so co-op and practice are not pinned at 0%', () => {
        // 3 of 9 safe cells.
        expect(stats().ownProgressPercent).toBe(33);
    });

    test('an empty board cannot divide by nothing', () => {
        act(() => {
            useMinesweeperStore.getState().setBoard([]);
            useMinesweeperStore.getState().setDimensions(0, 0, 0);
        });

        expect(stats().ownProgressPercent).toBe(0);
    });

    test('a board that is all mines has nothing to clear', () => {
        act(() => {
            useMinesweeperStore.getState().setBoard([[cell({ isMine: true })]]);
            useMinesweeperStore.getState().setDimensions(1, 1, 1);
        });

        expect(stats().ownProgressPercent).toBe(0);
    });
});

describe('progress in a race', () => {
    test('the SERVER total wins, since it is the authority on the shared board', () => {
        // Deliberately disagrees with the board's own 9, to prove which is used.
        act(() => useMinesweeperStore.getState().setPvpTotalSafeCells(6));

        expect(stats().ownProgressPercent).toBe(50);
    });

    test('the opponent is measured the same way', () => {
        act(() => {
            useMinesweeperStore.getState().setPvpTotalSafeCells(6);
            useMinesweeperStore.getState().setPvpOpponentProgress(3);
        });

        expect(stats().opponentProgressPercent).toBe(50);
    });

    test('before the race starts there is no server total to divide by', () => {
        // pvpTotalSafeCells is 0 until startPvpGame sets it. Falling back to the
        // board here is harmless: nothing is open yet either way.
        act(() => useMinesweeperStore.getState().setBoard(board(10, 0)));

        expect(stats().ownProgressPercent).toBe(0);
    });
});
