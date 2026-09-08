/**
 * A token bucket, as plain arithmetic. Pure: `now` is passed in and the caller
 * owns the state, which lives on `socket.data` and is collected with the socket
 * rather than pruned from a Map. Mutates the bucket it is given.
 */

/**
 * Hover is the one event a client sends continuously, and the only one that
 * fans out to every other player. `hooks/useGameActions.ts` throttles it to
 * ~10/s; 20/s leaves room for jitter and bursts, and caps a client that
 * ignores the throttle.
 */
const HOVER_PER_SECOND = 20;

/** Allowed straight away after a quiet spell — covers a burst on reconnect. */
const HOVER_BURST = 20;

/**
 * Expression — emotes, and anything else deliberate that fans out to the room.
 * ONE bucket for the category: separate buckets would let a client alternate
 * between two and send at double the rate. Keyed `socket.data.expressionBucket`
 * by the caller. The burst is the real limit; one per second afterwards is
 * faster than anyone reads them.
 */
const EXPRESSION_PER_SECOND = 1;
const EXPRESSION_BURST = 3;

const createBucket = (capacity, refillPerSecond) => ({
    capacity,
    refillPerSecond,
    tokens: capacity,
    // Filled in on first use, so an old bucket does not appear to have been refilling.
    updatedAt: null,
});

/**
 * Takes one token if there is one; returns whether the action may proceed.
 * Refills continuously, since a fixed window allows double the rate across
 * its boundary. `updatedAt` only moves FORWARD: clamping the elapsed interval
 * alone stops a backward clock crediting tokens on that call, but rewinding
 * the mark credits the same stretch again when the clock recovers. The caller
 * should pass a MONOTONIC reading (see server.js) anyway.
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

module.exports = {
    createBucket,
    takeToken,
    HOVER_PER_SECOND,
    HOVER_BURST,
    EXPRESSION_PER_SECOND,
    EXPRESSION_BURST,
};
