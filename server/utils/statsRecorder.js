/**
 * Bridges "the server decided a game ended" to rows in Postgres. BEST-EFFORT:
 * guests are skipped, a missing database is a no-op, a Postgres error is
 * logged and dropped. Nothing here is awaited by callers. Identity comes from
 * `socket.data.user`, resolved at connect by the io middleware.
 */

const { io } = require('./initializeClient');
const { isDbEnabled } = require('./initializePgClient');
const statsRepo = require('../data/statsRepo');
const { SERVER_EVENTS } = require('../../shared/events');
const { socketIdsOf } = require('./presence');
const { boardKey, playersForClear } = require('../../shared/boardKeys');

/**
 * Board records key on the board and how many cleared it (CLAUDE.md trap #10,
 * `shared/boardKeys.js`). `playersForClear` is the CLIENT's rule too, so a
 * race files as solo. Derived HERE, once, rather than at the four game-over
 * sites, so a key cannot disagree with its own count.
 *
 * @param board          the finished board
 * @param mode           'co-op' | 'pvp' | 'daily'
 * @param playersInRoom  how many were in the room, however the mode counts them
 */
const boardKeyOf = (board, mode, playersInRoom) => {
    const rows = board.length;
    const cols = board[0]?.length ?? 0;
    let mines = 0;
    for (const row of board) for (const cell of row) if (cell.isMine) mines++;
    return boardKey(rows, cols, mines, playersForClear(mode, playersInRoom));
};

/** The account behind a live socket, or null for guests and gone sockets. */
const userOf = (socketId) => io.sockets.sockets.get(socketId)?.data?.user ?? null;

/*
 * The account -> sockets scan lives in utils/presence.js; see there for why
 * it is a scan and not a `user:<id>` room.
 */

/**
 * Tells a player what they unlocked once the transaction has COMMITTED;
 * `recordResult` returns only what was new. Addressed to the ACCOUNT's current
 * sockets, not the finishing one: each route dials its own socket
 * (ARCHITECTURE.md §5), so a navigation during the write would drop the toast.
 * Per player, never the room — co-op players have different shelves.
 */
const announce = (userId) => (unlocked) => {
    if (!unlocked || unlocked.length === 0) return;
    for (const socketId of socketIdsOf(userId)) {
        io.to(socketId).emit(SERVER_EVENTS.ACHIEVEMENTS_UNLOCKED, { ids: unlocked });
    }
};

/**
 * Records one result per AUTHENTICATED socket; guests are skipped. Fire-and-forget.
 * Takes the BOARD, not a key, so the key and its count come from one reading.
 *
 * @param socketIds array of socket ids sharing this outcome
 * @param result    { mode, board, won, durationMs|null, players, finishedAt,
 *                    dailyDate? ('YYYY-MM-DD' puzzle date, daily mode only) }
 */
const recordForSockets = (socketIds, { board, ...result }) => {
    if (!isDbEnabled()) return;
    // The board stops here: the repo stores a key, not cells.
    const stored = { ...result, boardKey: boardKeyOf(board, result.mode, result.players) };
    for (const socketId of socketIds) {
        const user = userOf(socketId);
        if (!user) continue;
        statsRepo
            .recordResult(user.id, stored)
            /*
             * Two-argument `then`, so a failed WRITE and a failed ANNOUNCE are
             * never reported as each other.
             */
            .then(announce(user.id), (error) => {
                console.error('Stats write dropped:', error.message);
            })
            .catch((error) => {
                console.error('Achievement announce dropped:', error.message);
            });
    }
};

module.exports = { recordForSockets };
