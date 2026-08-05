/**
 * Who currently holds a browser session.
 *
 * The session id is the only credential a returning player presents: whoever
 * sends one is offered that session's room and display name, and takes its seat
 * in the room. Nothing binds it to a socket, an account or an address, so a
 * leaked id is the whole identity.
 *
 * What separates a genuine return from someone else arriving with the same id is
 * the state of the socket the session is bound to. A reload, a dropped network
 * and a closed tab all leave that socket disconnected — that is the case the
 * resume exists for. A socket that is still *connected* is a player sitting in
 * the room right now, and handing their seat to a second client is not a
 * reconnect however the id got there.
 *
 * Local to this process, like every other socket lookup here: there is no
 * socket.io Redis adapter, so `io` only knows its own connections. That is the
 * same assumption rooms already make.
 */

const { io } = require('./initializeClient');
const sessionRepo = require('../data/sessionRepo');

/**
 * The socket a session is bound to, and whether it is still connected.
 *
 * `live` is deliberately false for a session bound to a socket this process has
 * never heard of — an unknown socket cannot be the one actively playing here,
 * and refusing on that basis would break every ordinary reconnect.
 */
const sessionHolder = async (sessionId) => {
    const socketId = (await sessionRepo.getSocketId(sessionId)) || null;
    const live = Boolean(socketId && io.sockets?.sockets?.get(socketId)?.connected);
    return { socketId, live };
};

/**
 * Whether `socketId` presenting this session would be taking it from a client
 * that is still connected — i.e. a takeover rather than a return.
 */
const isTakeoverOfLiveSession = async (sessionId, socketId) => {
    const { socketId: holder, live } = await sessionHolder(sessionId);
    return live && holder !== socketId;
};

module.exports = { sessionHolder, isTakeoverOfLiveSession };
