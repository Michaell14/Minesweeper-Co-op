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

/** Hash: the room's whole game state. See ARCHITECTURE.md for the field list. */
const roomKey = (room) => `room:${room}`;

/** Hash: one connected player, keyed by socket id (so it does not survive reconnects). */
const playerKey = (socketId) => `player:${socketId}`;

/** Lock: co-op first-click board generation. */
const initLockKey = (room) => `init_lock:${room}`;

/** Lock: PVP first-click board generation, per player. */
const pvpInitLockKey = (room, playerIndex) => `init_lock_pvp:${room}:${playerIndex}`;

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
    PLAYER_TTL_SECONDS,
    LOCK_TTL_SECONDS,
    roomKey,
    playerKey,
    initLockKey,
    pvpInitLockKey,
    winnerLockKey,
    pvpPlayerFields,
};
