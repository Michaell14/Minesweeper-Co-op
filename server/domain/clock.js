/**
 * The room clock.
 *
 * Timestamps live in Redis so every player in a room reads the same clock and a
 * refresh resumes rather than restarting. The client ticks locally from
 * `startedAt`, so nothing is streamed per second.
 *
 * Dependency-free on purpose, like the rest of server/domain — see CLAUDE.md
 * trap #1.
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
 * The payload for a run that has just finished.
 *
 * Callers pass the room state they are already holding rather than reading it
 * back — they have just written `endedAt` themselves, so a round-trip would only
 * re-fetch a value they know.
 */
const stoppedAt = (roomState, endedAt) => ({ startedAt: startedAtOf(roomState), endedAt });

module.exports = { clockOf, startedAtOf, stoppedAt, readStamp };
