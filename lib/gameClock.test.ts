import { describe, expect, test } from 'vitest';
import { elapsedSeconds, formatClock } from './gameClock';

/**
 * The clock is the one number on screen a player can check against their own
 * watch, so a rounding or padding slip is both visible and embarrassing. These
 * are the cases the two consumers — the live timer and the end-of-game summary —
 * have to agree on.
 */

describe('elapsedSeconds', () => {
    test('an unstarted run is zero', () => {
        expect(elapsedSeconds(null, null, 5_000)).toBe(0);
    });

    test('a running clock counts from the start', () => {
        expect(elapsedSeconds(1_000, null, 8_000)).toBe(7);
    });

    test('a finished clock freezes at the end, ignoring now', () => {
        expect(elapsedSeconds(1_000, 8_000, 999_000)).toBe(7);
    });

    test('partial seconds round down, so the display never runs ahead', () => {
        expect(elapsedSeconds(0, 1_999)).toBe(1);
    });

    test('clock skew cannot produce a negative reading', () => {
        // The stamps are the server's and `now` is the browser's, so a client
        // running behind can legitimately see endedAt in its own future.
        expect(elapsedSeconds(10_000, null, 5_000)).toBe(0);
    });
});

describe('formatClock', () => {
    test('pads both fields', () => {
        expect(formatClock(5)).toBe('00:05');
        expect(formatClock(65)).toBe('01:05');
    });

    test('minutes keep counting past ten', () => {
        expect(formatClock(11 * 60 + 9)).toBe('11:09');
    });

    test('an hour widens the format rather than wrapping to 00:00', () => {
        expect(formatClock(3600)).toBe('1:00:00');
        expect(formatClock(3661)).toBe('1:01:01');
    });

    test('under an hour stays mm:ss', () => {
        expect(formatClock(3599)).toBe('59:59');
    });
});
