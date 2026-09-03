import { describe, expect, test } from 'vitest';
import { elapsedSeconds, formatClock, formatElapsed } from './gameClock';

/**
 * The clock is the one number a player checks against their own watch. These
 * are the cases the live timer and the summary have to agree on.
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
        // Server stamps, browser `now`: a client running behind can see endedAt in its future.
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

/**
 * The second rendering: `formatClock` pads the minute for a fixed-width timer;
 * `formatElapsed` does not, because it goes in prose and table cells. Same
 * module now, so the difference is chosen rather than stumbled into.
 */
describe('formatElapsed', () => {
    test('takes milliseconds, not seconds', () => {
        expect(formatElapsed(125_000)).toBe('2:05');
    });

    test('does not pad the minute, which is the whole difference', () => {
        expect(formatElapsed(125_000)).toBe('2:05');
        expect(formatClock(125)).toBe('02:05');
    });

    test('still pads the seconds', () => {
        expect(formatElapsed(65_000)).toBe('1:05');
        expect(formatElapsed(60_000)).toBe('1:00');
    });

    test('a negative duration is empty, not a minus sign', () => {
        expect(formatElapsed(-1)).toBe('0:00');
    });

    test('keeps counting minutes past an hour rather than widening', () => {
        // Unlike formatClock. Dropping an hour silently would be worse than an odd number.
        expect(formatElapsed(3_600_000)).toBe('60:00');
    });
});
