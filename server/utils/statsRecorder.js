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
const { SERVER_EVENTS } = require('../../shared/events');
const { boardKey, playersForClear } = require('../../shared/boardKeys');

/**
 * Board records key on what the board IS and on how many people cleared it —
 * CLAUDE.md trap #10, and `shared/boardKeys.js` for why the group is part of
 * the identity rather than a note on it.
 *
 * The count goes through `playersForClear`, the rule the CLIENT applies to the
 * same clear: a race files as the solo work it is, not as a two-player result.
 *
 * Module-private, and derived HERE rather than at the four game-over sites:
 * each of those already states the mode and the room size once, and stating
 * them a second time to build a key is how a result ends up with a key that
 * disagrees with its own count.
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

/**
 * Every live socket belonging to an account, resolved NOW rather than assumed.
 *
 * A scan rather than a `user:<id>` room, which would be the idiomatic answer
 * anywhere else: room codes here are arbitrary strings (`validation.js` bounds
 * only the length), so `socket.join('user:<uuid>')` shares a namespace with
 * whatever players type into the join box — and anyone who knew a victim's id
 * could create that room and receive their announcements. Unlocks are rare and
 * the socket map is small, so the scan costs nothing worth protecting.
 */
const socketIdsOf = (userId) => {
    const ids = [];
    for (const [socketId, socket] of io.sockets.sockets) {
        if (socket?.data?.user?.id === userId) ids.push(socketId);
    }
    return ids;
};

/**
 * Tells a player what they just unlocked, once the transaction has COMMITTED —
 * a badge announced by a write that then rolled back is a badge the profile
 * will not have. `recordResult` returns only what was genuinely new, so a
 * player who already held one is not told again and an empty list sends
 * nothing.
 *
 * Addressed to the ACCOUNT's current sockets, not the one that finished the
 * game. Each route dials its own socket (ARCHITECTURE.md §5), so navigating to
 * /daily or reconnecting through a blip in the milliseconds the transaction
 * takes leaves the finishing socket dead — the write still lands, and emitting
 * at it would drop the toast on the floor. Hitting every tab the player has
 * open falls out of this, which is what you want from "you earned something".
 *
 * Still per player, never to the game room: co-op players finish the same board
 * with different shelves behind them.
 */
const announce = (userId) => (unlocked) => {
    if (!unlocked || unlocked.length === 0) return;
    for (const socketId of socketIdsOf(userId)) {
        io.to(socketId).emit(SERVER_EVENTS.ACHIEVEMENTS_UNLOCKED, { ids: unlocked });
    }
};

/**
 * Records one result for every AUTHENTICATED socket in the list; guests are
 * skipped without comment. Fire-and-forget: call it, do not await it.
 *
 * Takes the BOARD, not a key: callers state the mode and the room size once
 * each and this derives the key from them, so a key and the count it implies
 * cannot come from two different readings of the same game.
 *
 * @param socketIds array of socket ids sharing this outcome
 * @param result    { mode, board, won, durationMs|null, players, finishedAt,
 *                    dailyDate? ('YYYY-MM-DD' puzzle date, daily mode only) }
 */
const recordForSockets = (socketIds, { board, ...result }) => {
    if (!isDbEnabled()) return;
    // The board itself stops here — the repo stores a key, and handing it a few
    // hundred cells to ignore invites someone to persist them one day.
    const stored = { ...result, boardKey: boardKeyOf(board, result.mode, result.players) };
    for (const socketId of socketIds) {
        const user = userOf(socketId);
        if (!user) continue;
        statsRepo
            .recordResult(user.id, stored)
            /*
             * Two-argument `then`, so a failed WRITE and a failed ANNOUNCE are
             * never reported as each other. A single trailing `.catch` reads
             * every emit error as "Stats write dropped" and sends whoever is
             * on call to look at Postgres for a socket problem.
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
