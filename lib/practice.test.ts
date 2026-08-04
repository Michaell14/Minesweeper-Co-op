/**
 * The practice race's target time.
 *
 * Pure logic, so no DOM — but `readBestTime` reads localStorage, which jsdom
 * would normally supply. It is stubbed instead of pulled in: what matters here
 * is the arithmetic and which record gets picked, and neither needs a document.
 *
 * This is the kind of code that fails plausibly. A target derived from the
 * wrong record, or a percentage that quietly exceeds 100, produces a bar that
 * still moves and still looks like a race — so it would be believed.
 */

import { describe, expect, test, beforeEach, vi } from 'vitest';
import { practiceTargetFor, targetPercent, PRACTICE_PAR_MS } from './practice';
import { boardKey, clearBestTimes, recordBestTime } from './bestTimes';

/** localStorage, minimally, since these run in Node. */
beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal('window', { localStorage: globalThis.localStorage });
    clearBestTimes();
});

const BOARD = { rows: 16, cols: 16, mines: 40 };
const targetForBoard = () => practiceTargetFor(BOARD.rows, BOARD.cols, BOARD.mines);

describe('which time you race', () => {
    test('a player with no record races the par, and it says so', () => {
        const target = targetForBoard();
        expect(target.ms).toBe(PRACTICE_PAR_MS);
        // The flag is what stops the UI calling a number we invented "your best".
        expect(target.isPersonal).toBe(false);
    });

    test('a player with a record races their own time', () => {
        recordBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines), {
            seconds: 137,
            players: 1,
            at: 1,
        });

        expect(targetForBoard()).toEqual({ ms: 137000, isPersonal: true });
    });

    test('a group clear is NOT taken as a solo target', () => {
        // Two people split a board faster than one person can, more or less by
        // construction (see lib/bestTimes.ts). Racing a solo run against it
        // would hand every player an unbeatable target the moment they played
        // once with a friend.
        recordBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines, 3), {
            seconds: 40,
            players: 3,
            at: 1,
        });

        expect(targetForBoard()).toEqual({ ms: PRACTICE_PAR_MS, isPersonal: false });
    });

    test('a record on a different board is not borrowed', () => {
        recordBestTime(boardKey(9, 9, 10), { seconds: 20, players: 1, at: 1 });

        expect(targetForBoard().isPersonal).toBe(false);
    });

    test('an absurdly fast stored record still leaves a raceable target', () => {
        recordBestTime(boardKey(BOARD.rows, BOARD.cols, BOARD.mines), {
            seconds: 0,
            players: 1,
            at: 1,
        });

        // Zero would make the bar full before the first click and divide the
        // percentage by nothing.
        expect(targetForBoard().ms).toBeGreaterThan(0);
    });
});

describe('how full the target bar is', () => {
    const TARGET = 100000;

    test('is empty before the run starts', () => {
        expect(targetPercent(null, null, TARGET)).toBe(0);
    });

    test('tracks elapsed time against the target', () => {
        expect(targetPercent(1000, null, TARGET, 1000 + TARGET / 4)).toBe(25);
        expect(targetPercent(1000, null, TARGET, 1000 + TARGET / 2)).toBe(50);
    });

    test('stops at full rather than running past the end of the bar', () => {
        expect(targetPercent(1000, null, TARGET, 1000 + TARGET * 3)).toBe(100);
    });

    test('freezes when the run ends, like the clock it reads', () => {
        const frozen = targetPercent(1000, 1000 + TARGET / 2, TARGET, 1000 + TARGET * 10);
        expect(frozen).toBe(50);
    });

    test('a target of zero cannot divide the bar by nothing', () => {
        expect(targetPercent(1000, null, 0, 5000)).toBe(0);
    });
});
