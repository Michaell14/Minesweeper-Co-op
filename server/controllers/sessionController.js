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
 * PVP needs more than co-op — the room addresses each racer's board by socket
 * id, so the slot has to be repointed — but that lives in `restorePvpRacer`,
 * which runs as part of the join this offer triggers.
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

    socket.emit(SERVER_EVENTS.SESSION_RESUME, { room, name });
    return true;
};

/** Makes this session unresumable. Called only when a player leaves on purpose. */
const forgetRoom = async (socket) => {
    const sessionId = sessionIdOf(socket);
    if (sessionId) await sessionRepo.clearRoom(sessionId);
};

module.exports = { offerResume, forgetRoom };
