/**
 * Who a socket plays as.
 *
 * A signed-in player is their ACCOUNT: their display name goes on the
 * scoreboard and they are never asked to type one. The typed name is the
 * fallback, which covers every signed-out player and the case where the client
 * believes it is signed in but the handshake's token did not resolve here.
 *
 * Read from `socket.data.user`, the CONNECT-TIME snapshot, rather than re-read
 * from Postgres. The daily leaderboard does the opposite on purpose
 * (dailyController's submit) because it is durable and public — a stale rename
 * gets carved into it permanently. A room is neither: it lives minutes, and
 * joining one is on the critical path of starting a game. Putting a database
 * read in front of every join would make account availability a precondition
 * for playing, which is the one thing the socket path is written not to do.
 *
 * Normalised but NOT validated here: an OAuth-seeded name is still arbitrary
 * input, so every caller runs it through `isValidPlayerName` exactly as it did
 * when the name only ever came from a form.
 */
const { normalizePlayerName } = require('../validation');

/** The name to store for this socket, account first. */
const displayNameFor = (socket, typedName) =>
    normalizePlayerName(socket?.data?.user?.displayName || typedName);

module.exports = { displayNameFor };
