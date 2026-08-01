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
 * Daily challenge data outlives a room (players may check results or the
 * leaderboard the morning after), but still needs to age out on its own —
 * there is no scheduler in this app to sweep it. 48h covers "finished near
 * midnight UTC" and "checked the next morning" without a dedicated policy.
 */
const DAILY_TTL_SECONDS = 172800;

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
 * The daily challenge is NOT modeled as a room — see ARCHITECTURE.md / the
 * daily-challenge plan for why (co-op rooms share one mutable board across
 * every member, PVP is hard-capped at 2 players with numbered fields; neither
 * shape fits N independent solo attempts against one template board). This is
 * a separate, parallel key namespace instead, addressed by UTC date and, for
 * per-player state, an opaque client-generated token — never a socket id,
 * since one browser's attempt must survive a reconnect.
 */

/** Hash: the day's generated template board (seed, dims, opened start cell). */
const dailyBoardKey = (date) => `daily:${date}:board`;

/** ZSET: member = attempt token, score = elapsedMs. Ascending = fastest. */
const dailyLeaderboardKey = (date) => `daily:${date}:leaderboard`;

/** Hash: one player's attempt for the day (status, board, name, timestamps). */
const dailyAttemptKey = (date, token) => `daily:${date}:attempt:${token}`;

/** Lock: serialises daily board generation. Optimization only, not a
 * correctness requirement -- see server/game/daily.js. */
const dailyGenLockKey = (date) => `daily:${date}:gen_lock`;

/** Lock: serialises two near-simultaneous starts for the same token (e.g. two
 * tabs of the same browser, since the token is shared via localStorage). */
const dailyStartLockKey = (date, token) => `daily:${date}:start_lock:${token}`;

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
    DAILY_TTL_SECONDS,
    roomKey,
    playerKey,
    sessionKey,
    initLockKey,
    winnerLockKey,
    pvpPlayerFields,
    dailyBoardKey,
    dailyLeaderboardKey,
    dailyAttemptKey,
    dailyGenLockKey,
    dailyStartLockKey,
};
