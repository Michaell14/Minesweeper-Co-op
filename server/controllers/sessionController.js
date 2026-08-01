/**
 * Putting a returning browser back where it was.
 *
 * A reload gives you a new socket, and player records are keyed by socket id, so
 * the player is gone. The session outlives it and remembers the room — this is
 * what turns that memory into a rejoin.
 *
 * The distinction that makes it safe: leaving on purpose and dropping off the
 * network arrive at the same `removePlayer`. Only the deliberate exit calls
 * `forgetRoom`, so only the accidental one is ever resumed.
 */

const roomRepo = require('../data/roomRepo');
const sessionRepo = require('../data/sessionRepo');
const { SERVER_EVENTS } = require('../../shared/events');

const sessionIdOf = (socket) => socket.handshake?.auth?.sessionId || '';

/**
 * Tells a reconnecting socket which room it can rejoin, if any.
 *
 * The offer is only made, never taken: the client answers with an ordinary
 * `joinRoom`, so a resume runs the same validated path as a manual join rather
 * than a parallel one that could drift from it.
 *
 * Co-op only. A PVP board is stored per player behind a `pvpPlayerIndex` that
 * does not survive the socket swap, so resuming a race would also need that
 * player's own board and progress restored — a bigger piece than this, and
 * dropping someone into a PVP room with an empty board is worse than sending
 * them to the landing page.
 */
const offerResume = async (socket) => {
    const sessionId = sessionIdOf(socket);
    if (!sessionId) return false;

    const { room, name } = await sessionRepo.getState(sessionId);
    // Both are required: `joinRoom` is rejected without a name, so offering a
    // resume we know cannot be accepted would just bounce the player.
    if (!room || !name) return false;

    // The room may have expired while they were away.
    if (!(await roomRepo.exists(room))) return false;

    if ((await roomRepo.getField(room, 'mode')) === 'pvp') return false;

    socket.emit(SERVER_EVENTS.SESSION_RESUME, { room, name });
    return true;
};

/** Makes this session unresumable. Called only when a player leaves on purpose. */
const forgetRoom = async (socket) => {
    const sessionId = sessionIdOf(socket);
    if (sessionId) await sessionRepo.clearRoom(sessionId);
};

module.exports = { offerResume, forgetRoom };
