/**
 * The hover rate limit. `cellHover` is the one message a client sends
 * continuously, and it fans out to every other player; measured unlimited, a
 * flood in one room pushed an UNINVOLVED room from 6ms to 2785ms per request.
 * Pure arithmetic with the clock passed in, hence domain/ and no timers.
 */

const {
    createBucket,
    takeToken,
    HOVER_PER_SECOND,
    HOVER_BURST,
} = require('../domain/rateLimit');

describe('a token bucket', () => {
    test('allows a full burst straight away', () => {
        const bucket = createBucket(5, 5);
        const allowed = [0, 0, 0, 0, 0].filter(() => takeToken(bucket, 1000));

        expect(allowed).toHaveLength(5);
    });

    test('refuses once the burst is spent', () => {
        const bucket = createBucket(3, 3);
        [1, 2, 3].forEach(() => takeToken(bucket, 1000));

        expect(takeToken(bucket, 1000)).toBe(false);
    });

    test('refills with time passing, not in windows', () => {
        // A fixed window would allow a full bucket at the end of one and another at the start of the next.
        const bucket = createBucket(10, 10);
        for (let i = 0; i < 10; i++) takeToken(bucket, 1000);
        expect(takeToken(bucket, 1000)).toBe(false);

        // Half a second at 10/s is five tokens, not a fresh bucket.
        expect([0, 0, 0, 0, 0].filter(() => takeToken(bucket, 1500))).toHaveLength(5);
        expect(takeToken(bucket, 1500)).toBe(false);
    });

    test('never banks more than the burst, however long the pause', () => {
        const bucket = createBucket(4, 4);
        takeToken(bucket, 1000);

        // An hour idle must not buy an hour's worth of messages.
        expect([0, 0, 0, 0, 0, 0].filter(() => takeToken(bucket, 1000 + 3_600_000))).toHaveLength(4);
    });

    test('a clock that goes backwards does not grant free tokens', () => {
        const bucket = createBucket(2, 2);
        takeToken(bucket, 5000);
        takeToken(bucket, 5000);

        expect(takeToken(bucket, 1000)).toBe(false);
    });

    test('the first call does not credit time before the bucket existed', () => {
        const bucket = createBucket(2, 100);
        // First used at t=10_000. If `updatedAt` started at 0 this would have refilled ten seconds.
        [0, 0].forEach(() => takeToken(bucket, 10_000));

        expect(takeToken(bucket, 10_000)).toBe(false);
    });
});

describe('the hover limit as configured', () => {
    /* The client throttles to one per 100ms; the limit must not bite a real one. */
    test('a client obeying its own 100ms throttle is never refused', () => {
        const bucket = createBucket(HOVER_BURST, HOVER_PER_SECOND);
        const refused = [];

        for (let i = 0; i < 300; i++) {
            if (!takeToken(bucket, 1000 + i * 100)) refused.push(i);
        }

        expect(refused).toEqual([]);
    });

    test('a client at double the intended rate still gets through', () => {
        // Headroom for jitter and a burst after a stalled frame.
        const bucket = createBucket(HOVER_BURST, HOVER_PER_SECOND);
        const refused = [];

        for (let i = 0; i < 200; i++) {
            if (!takeToken(bucket, 1000 + i * 50)) refused.push(i);
        }

        expect(refused).toEqual([]);
    });

    test('a flood is capped at the refill rate, not the rate it is sent', () => {
        const bucket = createBucket(HOVER_BURST, HOVER_PER_SECOND);
        let allowed = 0;

        // 10,000 messages inside one second, roughly the bug bash's attacker.
        for (let i = 0; i < 10_000; i++) {
            if (takeToken(bucket, 1000 + i * 0.1)) allowed++;
        }

        // The burst, plus one second of refill.
        expect(allowed).toBeLessThanOrEqual(HOVER_BURST + HOVER_PER_SECOND);
        expect(allowed).toBeGreaterThan(0);
    });
});

/**
 * Clamping the elapsed interval stops a backward clock crediting tokens on THAT
 * call, but rewinding `updatedAt` would credit the same interval twice on recovery.
 */
describe('a clock that goes backwards and then recovers', () => {
    test('does not credit the same interval twice', () => {
        const bucket = createBucket(20, 20);
        for (let i = 0; i < 20; i++) takeToken(bucket, 11_000);   // spend it all
        expect(takeToken(bucket, 11_000)).toBe(false);

        takeToken(bucket, 10_500);   // clock steps back half a second
        // ...and immediately recovers. No real time has passed, so no tokens.
        expect(takeToken(bucket, 11_000)).toBe(false);
    });
});
