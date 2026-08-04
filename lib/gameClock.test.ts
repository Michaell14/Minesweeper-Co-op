import { describe, expect, test } from 'vitest';
import { elapsedSeconds, formatClock, formatElapsed } from './gameClock';

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

/**
 * The second rendering, and why there are two.
 *
 * `formatClock` pads the minute so the ticking timer keeps a fixed width;
 * `formatElapsed` does not, because it goes in prose and table cells where
 * "02:05" reads like a typo. They lived in different modules — this one in
 * lib/dailyShare, a module about SHARING daily results — which is how a third
 * caller ended up importing a time formatter from the daily feature. Same
 * module now, so the difference has to be chosen rather than stumbled into.
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
        // Unlike formatClock, which would say 1:00:00 here. Nothing this
        // renders is expected to run that long, but silently dropping an hour
        // would be worse than an odd-looking number.
        expect(formatElapsed(3_600_000)).toBe('60:00');
    });
});
