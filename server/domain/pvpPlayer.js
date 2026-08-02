/**
 * Which of a PVP room's two boards a socket owns.
 *
 * This must stay dependency-free (no io, no Redis, no other server modules).
 *
 * The rule is one line and still worth a module of its own, because getting it
 * wrong is silent and it is needed in three places: the socket handlers, the
 * dispatch layer that picks a lock key, and the reset controller. It used to be
 * written out separately in each, and the copy in pvpController defaulted an
 * unassigned socket to index 0 — so a stranger reset PLAYER ONE's board.
 */

/**
 * The socket's zero-based player index, or null if startPvpGame never assigned
 * one.
 *
 * There is deliberately NO fallback. Index 0 addresses player1Board, so
 * defaulting to it hands an unassigned socket the first player's board to read,
 * write and lock. Callers must treat null as "refuse the action".
 *
 * `pvpPlayerIndex` comes out of Redis as a string, so a genuine index 0 arrives
 * as '0' — truthy, and therefore survives the presence check below. Testing the
 * parsed number instead would drop player one.
 */
const pvpIndexOf = (playerData) => {
    if (!playerData || !playerData.pvpPlayerIndex) return null;

    const index = parseInt(playerData.pvpPlayerIndex, 10);
    return Number.isInteger(index) ? index : null;
};

module.exports = { pvpIndexOf };
