/**
 * Which of a PVP room's two boards a socket owns. Dependency-free (no io, no
 * Redis, no other server modules).
 *
 * One line, and still its own module: getting it wrong is silent, and three
 * places need it — the socket handlers, the dispatch layer that picks a lock
 * key, and the reset controller. Written out separately in each, the copy in
 * pvpController defaulted an unassigned socket to 0, so a stranger reset PLAYER
 * ONE's board.
 */

/**
 * The socket's zero-based player index, or null if startPvpGame never assigned
 * one. Callers must treat null as "refuse the action" — there is deliberately no
 * fallback, since index 0 addresses player1Board.
 *
 * `pvpPlayerIndex` comes out of Redis as a string, so a genuine index 0 arrives
 * as truthy '0'. Testing the parsed number instead would drop player one.
 */
const pvpIndexOf = (playerData) => {
    if (!playerData || !playerData.pvpPlayerIndex) return null;

    const index = parseInt(playerData.pvpPlayerIndex, 10);
    return Number.isInteger(index) ? index : null;
};

module.exports = { pvpIndexOf };
