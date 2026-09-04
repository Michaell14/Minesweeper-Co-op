/**
 * Which of a PVP room's two boards a socket owns. Dependency-free. Its own
 * module because getting it wrong is silent and three places need it: a copy
 * in pvpController once defaulted an unassigned socket to 0, so a stranger
 * reset PLAYER ONE's board.
 */

/**
 * The socket's zero-based index, or null if startPvpGame never assigned one.
 * Callers must treat null as "refuse": index 0 addresses player1Board.
 * `pvpPlayerIndex` is a Redis string, so a genuine 0 arrives as truthy '0'.
 */
const pvpIndexOf = (playerData) => {
    if (!playerData || !playerData.pvpPlayerIndex) return null;

    const index = parseInt(playerData.pvpPlayerIndex, 10);
    return Number.isInteger(index) ? index : null;
};

module.exports = { pvpIndexOf };
