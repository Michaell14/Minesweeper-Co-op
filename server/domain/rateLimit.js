/**
 * A token bucket, as plain arithmetic. Pure — no timers, no storage, no clock
 * of its own: `now` is passed in, and the caller owns the state object.
 *
 * That is what keeps it leak-free at the call site. The state lives on
 * `socket.data`, so it is collected with the socket rather than accumulating in
 * a Map that something has to remember to prune on disconnect.
 *
 * Mutates the bucket it is given, the way `revealFrom` mutates the board it is
 * given — the caller allocated it and nothing else can see it.
 */

/**
 * Hover is the one event a client sends continuously rather than on purpose,
 * and the only one that fans out to every other player in the room.
 *
 * `hooks/useGameActions.ts` throttles it to one per 100ms, so a real client
 * sends at most ~10/s. 20/s is double that: jitter, a burst after a stalled
 * frame, and a fast mouse all fit under it, and nothing a person can do reaches
 * it. A client that ignores the throttle is capped here instead of costing the
 * server four Redis reads and one broadcast per player, per message.
 */
const HOVER_PER_SECOND = 20;

/** Allowed straight away after a quiet spell — covers a burst on reconnect. */
const HOVER_BURST = 20;

const createBucket = (capacity, refillPerSecond) => ({
    capacity,
    refillPerSecond,
    tokens: capacity,
    // Filled in on first use, so a bucket made long before its first message
    // does not appear to have been refilling all that time.
    updatedAt: null,
});

/**
 * Takes one token if there is one. Returns whether the action may proceed.
 *
 * Refills continuously rather than in windows: a fixed window lets a client
 * send a full bucket at the end of one and another at the start of the next,
 * which is twice the rate it was meant to allow.
 *
 * `updatedAt` only ever moves FORWARD, which is not the same guard as clamping
 * the elapsed interval and is the one that matters. Clamping alone stops a
 * backward clock crediting tokens on that call, but rewinding the mark means
 * the stretch between there and the recovered time is credited a second time —
 * so a clock that steps back and returns refills the bucket for time that had
 * already been paid out. Caught in review rather than by the test above it,
 * which only looked at the backward call itself.
 *
 * The caller should pass a MONOTONIC reading (see server.js) so this cannot
 * arise at all; this keeps the arithmetic honest for any clock it is handed.
 */
const takeToken = (bucket, now) => {
    if (bucket.updatedAt === null) bucket.updatedAt = now;

    const elapsedMs = Math.max(0, now - bucket.updatedAt);
    bucket.tokens = Math.min(
        bucket.capacity,
        bucket.tokens + (elapsedMs / 1000) * bucket.refillPerSecond,
    );
    bucket.updatedAt = Math.max(bucket.updatedAt, now);

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
};

module.exports = { createBucket, takeToken, HOVER_PER_SECOND, HOVER_BURST };
