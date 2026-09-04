/**
 * The room clock. Timestamps live in Redis so every player reads the same
 * clock and a refresh resumes rather than restarting; the client ticks locally
 * from `startedAt`. Dependency-free, like the rest of server/domain.
 */

/** Redis stores strings; absent or unparseable means "not set". */
const readStamp = (value) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
};

/** When the run began, or null if it has not. */
const startedAtOf = (roomState) => readStamp(roomState && roomState.startedAt);

/** The clock payload for a room, from its raw Redis state. */
const clockOf = (roomState) => ({
    startedAt: startedAtOf(roomState),
    endedAt: readStamp(roomState && roomState.endedAt),
});

/**
 * The payload for a run that has just finished. Callers pass the room state
 * they hold rather than re-reading the `endedAt` they just wrote.
 */
const stoppedAt = (roomState, endedAt) => ({ startedAt: startedAtOf(roomState), endedAt });

module.exports = { clockOf, startedAtOf, stoppedAt, readStamp };
