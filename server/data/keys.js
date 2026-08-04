/**
 * Every Redis key and TTL the server uses. Nothing outside server/data should
 * construct a key by hand.
 *
 * Pure — no client, no I/O.
 */

/** Rooms and players both expire after a day of inactivity. */
const ROOM_TTL_SECONDS = 86400;
const PLAYER_TTL_SECONDS = 86400;

/** Short lease used to serialise first-click board generation and win claims. */
const LOCK_TTL_SECONDS = 10;

/**
 * Lease on a single move — a handful of Redis round trips, plus board generation
 * on a co-op first click (~45ms at worst). Shorter than LOCK_TTL_SECONDS because
 * every move takes one, and a process that dies holding it blocks that board for
 * the full lease.
 */
const ACTION_LOCK_TTL_SECONDS = 5;

/**
 * Daily data outlives a room — players check results the morning after — but
 * nothing sweeps it, so it ages out on its own. 48h covers "finished near
 * midnight UTC, checked the next morning".
 */
const DAILY_TTL_SECONDS = 172800;

/**
 * How long an emptied room is kept before Redis drops it. A player who reloads
 * or briefly loses connection can come back to the same room within this window;
 * rejoining resets the TTL back to ROOM_TTL_SECONDS.
 */
const ROOM_GRACE_PERIOD_SECONDS = 600;

/**
 * How long the quick-match queue key survives with nothing touching it. Every
 * enqueue refreshes it, and entries go stale long before this, so it only ever
 * fires on a queue nobody has joined for an hour.
 */
const MATCH_QUEUE_TTL_SECONDS = 3600;

/**
 * How long a queue entry stays eligible. A socket that died without its
 * disconnect handler running (a dyno restart, a lost cleanup) would otherwise
 * sit at the head of the queue forever, matched and re-matched against nobody.
 */
const MATCH_ENTRY_STALE_MS = 120000;

/** Hash: the room's whole game state. See ARCHITECTURE.md for the field list. */
const roomKey = (room) => `room:${room}`;

/** Hash: one connected player, keyed by socket id (so it does not survive reconnects). */
const playerKey = (socketId) => `player:${socketId}`;

/**
 * Hash: a browser tab's persistent identity, surviving reconnects and reloads.
 * Player records are keyed by socket id and so do not survive; this maps a stable
 * id from the client's sessionStorage onto whichever socket it holds now.
 */
const sessionKey = (sessionId) => `session:${sessionId}`;

/** Lock: co-op first-click board generation. */
const initLockKey = (room) => `init_lock:${room}`;

/** Lock: claiming the PVP win, so a simultaneous finish has exactly one winner. */
const winnerLockKey = (room) => `winner_lock:${room}`;

/**
 * Lock: one PVP join at a time for a room. The capacity check and the join that
 * follows it are one decision, and two people opening the same invite together
 * would otherwise both find space and both take it.
 */
const joinLockKey = (room) => `join_lock:${room}`;

/**
 * Lock: one co-op move at a time. The whole board is one hash field, so every
 * move rewrites all of it; without this, overlapping moves erase each other.
 */
const actionLockKey = (room) => `action_lock:${room}`;

/**
 * Lock: one move at a time from ONE PVP player. Keyed per player, not per room —
 * the two hold separate board fields and are meant to race, so serialising them
 * against each other would be a bug of its own.
 */
const pvpActionLockKey = (room, playerIndex) => `action_lock:${room}:p${playerIndex}`;

/**
 * Hash: everyone waiting for a quick match. Field = socket id, value = JSON
 * {name, sessionId, queuedAt}.
 *
 * ONE queue rather than one per board configuration: a queue split twelve ways
 * by size and difficulty is twelve empty queues at this traffic level, so quick
 * match plays a fixed board (shared/boardConfig's DEFAULT_PRESET). Keyed by
 * socket id so a second click is an overwrite rather than a second place in
 * line.
 */
const matchQueueKey = () => 'matchmaking:queue';

/**
 * Lock: one pairing decision at a time.
 *
 * "Is anyone waiting, and if so take them" is one decision, exactly like the
 * PVP capacity check. Unlocked, two players arriving together both read an
 * empty queue and both sit down in it — each waiting for the other.
 */
const matchLockKey = () => 'matchmaking:lock';

/*
 * The daily challenge is NOT modeled as a room: co-op rooms share one mutable
 * board, PVP is hard-capped at 2 players with numbered fields, and neither shape
 * fits N independent solo attempts against one template. So it gets a parallel
 * key namespace, addressed by UTC date plus — for per-player state — an opaque
 * client-generated token, never a socket id, since an attempt must survive a
 * reconnect. See ARCHITECTURE.md §5.
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
 * Lock: one move at a time on one attempt — `dailyStartLockKey`'s two-tab problem
 * applied to MOVES. An attempt's board is one hash field, so two overlapping
 * moves rewrite all of it. Keyed per attempt, so players never wait on each other.
 */
const dailyActionLockKey = (date, token) => `daily:${date}:action_lock:${token}`;

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
