/**
 * Every Redis key and TTL the server uses. Nothing outside server/data should
 * construct a key by hand. Pure — no client, no I/O.
 */

/** Rooms and players both expire after a day of inactivity. */
const ROOM_TTL_SECONDS = 86400;
const PLAYER_TTL_SECONDS = 86400;

/** Short lease used to serialise first-click board generation and win claims. */
const LOCK_TTL_SECONDS = 10;

/**
 * Lease on one move (a few round trips; ~45ms worst with generation). Short,
 * since a process that dies holding it blocks the board for the full lease.
 */
const ACTION_LOCK_TTL_SECONDS = 5;

/** Daily data is never swept, so it ages out; 48h covers a result checked the morning after. */
const DAILY_TTL_SECONDS = 172800;

/**
 * How long an emptied room survives, so a reload or a brief drop can come back
 * to it. Rejoining resets the TTL to ROOM_TTL_SECONDS.
 */
const ROOM_GRACE_PERIOD_SECONDS = 600;

/** Idle life of the quick-match queue key. Every enqueue refreshes it. */
const MATCH_QUEUE_TTL_SECONDS = 3600;

/**
 * How long a queue entry stays eligible, so a socket that died without its
 * disconnect handler running cannot sit at the head forever.
 */
const MATCH_ENTRY_STALE_MS = 120000;

/** Hash: the room's whole game state. See ARCHITECTURE.md for the field list. */
const roomKey = (room) => `room:${room}`;

/** Hash: one connected player, keyed by socket id (so it does not survive reconnects). */
const playerKey = (socketId) => `player:${socketId}`;

/** Hash: a browser tab's persistent identity, mapping a stable client id onto its current socket. */
const sessionKey = (sessionId) => `session:${sessionId}`;

/** Lock: co-op first-click board generation. */
const initLockKey = (room) => `init_lock:${room}`;

/** Lock: claiming the PVP win, so a simultaneous finish has exactly one winner. */
const winnerLockKey = (room) => `winner_lock:${room}`;

/** Lock: one PVP join at a time; the capacity check and the join are one decision. */
const joinLockKey = (room) => `join_lock:${room}`;

/** Lock: one co-op move at a time. The board is one hash field, so overlapping moves erase each other. */
const actionLockKey = (room) => `action_lock:${room}`;

/** Lock: one move at a time from ONE PVP player. Per player, not per room — the two are meant to race. */
const pvpActionLockKey = (room, playerIndex) => `action_lock:${room}:p${playerIndex}`;

/**
 * Hash: everyone waiting for a quick match. Field = socket id, value = JSON
 * {name, sessionId, queuedAt}. ONE queue on a fixed board (DEFAULT_PRESET):
 * split by configuration it would be twelve empty queues. Keyed by socket id
 * so a second click overwrites rather than queues twice.
 */
const matchQueueKey = () => 'matchmaking:queue';

/** Lock: one pairing decision at a time, else two arrivals both read an empty queue and both wait. */
const matchLockKey = () => 'matchmaking:lock';

/*
 * The daily challenge is NOT a room (ARCHITECTURE.md §5): N solo attempts
 * against one template. Keys are addressed by UTC date plus an opaque client
 * token — never a socket id, since an attempt must survive a reconnect.
 */

/** Hash: the day's generated template board (seed, dims, opened start cell). */
const dailyBoardKey = (date) => `daily:${date}:board`;

/** ZSET: member = attempt token, score = elapsedMs. Ascending = fastest. */
const dailyLeaderboardKey = (date) => `daily:${date}:leaderboard`;

/** Hash: one player's attempt for the day (status, board, name, timestamps). */
const dailyAttemptKey = (date, token) => `daily:${date}:attempt:${token}`;

/** Lock: serialises daily board generation. An optimisation only — see server/game/daily.js. */
const dailyGenLockKey = (date) => `daily:${date}:gen_lock`;

/** Lock: two near-simultaneous starts for one token (two tabs share it via localStorage). */
const dailyStartLockKey = (date, token) => `daily:${date}:start_lock:${token}`;

/** Lock: one move at a time on one attempt. Per attempt, so players never wait on each other. */
const dailyActionLockKey = (date, token) => `daily:${date}:action_lock:${token}`;

/** PVP keeps both players in the SAME room hash under one-based numbered fields. */
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
    ACTION_LOCK_TTL_SECONDS,
    DAILY_TTL_SECONDS,
    MATCH_QUEUE_TTL_SECONDS,
    MATCH_ENTRY_STALE_MS,
    roomKey,
    playerKey,
    sessionKey,
    initLockKey,
    winnerLockKey,
    actionLockKey,
    pvpActionLockKey,
    joinLockKey,
    matchQueueKey,
    matchLockKey,
    pvpPlayerFields,
    dailyBoardKey,
    dailyLeaderboardKey,
    dailyAttemptKey,
    dailyGenLockKey,
    dailyStartLockKey,
    dailyActionLockKey,
};
