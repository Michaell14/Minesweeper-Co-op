/**
 * Every Redis key and TTL the server uses.
 *
 * These were previously built as inline template strings in seven files, so the
 * data model could only be discovered by grepping for backticks. Nothing outside
 * server/data should construct a key by hand.
 *
 * Pure — no client, no I/O.
 */

/** Rooms and players both expire after a day of inactivity. */
const ROOM_TTL_SECONDS = 86400;
const PLAYER_TTL_SECONDS = 86400;

/** Short lease used to serialise first-click board generation and win claims. */
const LOCK_TTL_SECONDS = 10;

/**
 * How long an emptied room is kept before Redis drops it. A player who reloads
 * or briefly loses connection can come back to the same room within this window;
 * rejoining resets the TTL back to ROOM_TTL_SECONDS.
 */
const ROOM_GRACE_PERIOD_SECONDS = 600;

/** Hash: the room's whole game state. See ARCHITECTURE.md for the field list. */
const roomKey = (room) => `room:${room}`;

/** Hash: one connected player, keyed by socket id (so it does not survive reconnects). */
const playerKey = (socketId) => `player:${socketId}`;

/**
 * Hash: a browser's persistent identity, surviving reconnects and reloads.
 * Player records are keyed by socket id and so do not survive; this maps a
 * stable id from the client's localStorage onto whichever socket it holds now.
 */
const sessionKey = (sessionId) => `session:${sessionId}`;

/** Lock: co-op first-click board generation. */
const initLockKey = (room) => `init_lock:${room}`;

/** Lock: claiming the PVP win, so a simultaneous finish has exactly one winner. */
const winnerLockKey = (room) => `winner_lock:${room}`;

/**
 * PVP stores both players' state in the SAME room hash under numbered field
 * names, one-based: player index 0 reads and writes player1Board, and so on.
 */
const pvpPlayerFields = (playerIndex) => ({
    boardKey: `player${playerIndex + 1}Board`,
    initializedKey: `player${playerIndex + 1}Initialized`,
    gameOverKey: `player${playerIndex + 1}GameOver`,
    gameWonKey: `player${playerIndex + 1}GameWon`,
    progressKey: `player${playerIndex + 1}Progress`,
    socketKey: `player${playerIndex + 1}Socket`,
});

module.exports = {
    ROOM_TTL_SECONDS,
    ROOM_GRACE_PERIOD_SECONDS,
    PLAYER_TTL_SECONDS,
    LOCK_TTL_SECONDS,
    roomKey,
    playerKey,
    sessionKey,
    initLockKey,
    winnerLockKey,
    pvpPlayerFields,
};
