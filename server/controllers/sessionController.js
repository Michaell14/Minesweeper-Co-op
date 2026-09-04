/**
 * Putting a returning browser back where it was. A reload gives a new socket,
 * so the player is gone; the session outlives it and remembers the room.
 * Leaving on purpose and dropping off the network both reach `removePlayer`,
 * but only the deliberate exit calls `forgetRoom`, so only the accidental one
 * is ever resumed.
 */

const roomRepo = require('../data/roomRepo');
const sessionRepo = require('../data/sessionRepo');
const { isTakeoverOfLiveSession } = require('../utils/sessionGuard');
const { isValidSessionId } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/** The handshake's session id, or '' for anything that is not a usable one. */
const sessionIdOf = (socket) => {
    const id = socket.handshake?.auth?.sessionId;
    return isValidSessionId(id) ? id : '';
};

/**
 * Tells a reconnecting socket which room it can rejoin. The offer is only
 * made, never taken: the client answers with an ordinary `joinRoom`, so a
 * resume runs the same validated path as a manual join. PVP's slot repointing
 * lives in `restorePvpRacer`, inside that join.
 */
const offerResume = async (socket) => {
    const sessionId = sessionIdOf(socket);
    if (!sessionId) return false;

    /*
     * Not while someone still holds it: the offer names a room and a display
     * name, so a leaked session id would otherwise yield both. Every case this
     * exists for leaves the previous socket disconnected.
     */
    if (await isTakeoverOfLiveSession(sessionId, socket.id)) return false;

    const { room, name } = await sessionRepo.getState(sessionId);
    // `joinRoom` is rejected without a name, so an offer without one would just bounce.
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
