/**
 * Who currently holds a browser session. The session id is the only credential
 * a returning player presents, so a leaked id is the whole identity. What
 * separates a return from a takeover is the bound socket: disconnected (reload,
 * dropped network, closed tab) is the resume case; still connected is a player
 * sitting in the room now. Local to this process, like every socket lookup here:
 * there is no socket.io Redis adapter.
 */

const { io } = require('./initializeClient');
const sessionRepo = require('../data/sessionRepo');

/**
 * The socket a session is bound to, and whether it is still connected. `live`
 * is false for a socket this process has never heard of; refusing on that
 * would break every ordinary reconnect.
 */
const sessionHolder = async (sessionId) => {
    const socketId = (await sessionRepo.getSocketId(sessionId)) || null;
    const live = Boolean(socketId && io.sockets?.sockets?.get(socketId)?.connected);
    return { socketId, live };
};

/** Whether `socketId` presenting this session would take it from a still-connected client. */
const isTakeoverOfLiveSession = async (sessionId, socketId) => {
    const { socketId: holder, live } = await sessionHolder(sessionId);
    return live && holder !== socketId;
};

module.exports = { sessionHolder, isTakeoverOfLiveSession };
