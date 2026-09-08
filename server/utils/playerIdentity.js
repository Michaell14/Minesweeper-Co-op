/**
 * Who a socket plays as: a signed-in player is their ACCOUNT, the typed name
 * the fallback. Read from `socket.data.user`, the CONNECT-TIME snapshot, not
 * Postgres: a room lives minutes, and a database read on every join would make
 * account availability a precondition for playing. (The daily leaderboard
 * re-reads because it is durable and public.) Normalised but NOT validated: an
 * OAuth-seeded name is still arbitrary input, so callers run `isValidPlayerName`.
 */
const { normalizePlayerName } = require('../validation');

/** The name to store for this socket, account first. */
const displayNameFor = (socket, typedName) =>
    normalizePlayerName(socket?.data?.user?.displayName || typedName);

module.exports = { displayNameFor };
