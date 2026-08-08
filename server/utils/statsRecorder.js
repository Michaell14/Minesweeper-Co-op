/**
 * The bridge from "the server decided a game ended" to "rows in Postgres".
 *
 * BEST-EFFORT BY CONTRACT, like everything on a game path: anonymous sockets
 * are skipped silently, a missing database is a no-op, and a Postgres error
 * is logged and dropped — recording stats must never delay or break the
 * game-over emits it rides along with. Nothing here is awaited by callers.
 *
 * Identity comes from `socket.data.user`, resolved once at connect by the io
 * middleware — the game-end sites know socket ids, and this turns them back
 * into accounts.
 */

const { io } = require('./initializeClient');
const { isDbEnabled } = require('./initializePgClient');
const statsRepo = require('../data/statsRepo');

/** Board records key on what the board IS — CLAUDE.md trap #10. */
const boardKeyOf = (board) => {
    const rows = board.length;
    const cols = board[0]?.length ?? 0;
    let mines = 0;
    for (const row of board) for (const cell of row) if (cell.isMine) mines++;
    return `${rows}x${cols}/${mines}`;
};

/** The account behind a live socket, or null for guests and gone sockets. */
const userOf = (socketId) => io.sockets.sockets.get(socketId)?.data?.user ?? null;

/**
 * Records one result for every AUTHENTICATED socket in the list; guests are
 * skipped without comment. Fire-and-forget: call it, do not await it.
 *
 * @param socketIds array of socket ids sharing this outcome
 * @param result    { mode, boardKey, won, durationMs|null, players, finishedAt,
 *                    dailyDate? ('YYYY-MM-DD' puzzle date, daily mode only) }
 */
const recordForSockets = (socketIds, result) => {
    if (!isDbEnabled()) return;
    for (const socketId of socketIds) {
        const user = userOf(socketId);
        if (!user) continue;
        statsRepo.recordResult(user.id, result).catch((error) => {
            console.error('Stats write dropped:', error.message);
        });
    }
};

module.exports = { recordForSockets, boardKeyOf };
