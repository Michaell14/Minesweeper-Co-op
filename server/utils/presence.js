/**
 * Who among your friends is on the site right now, and telling them about you.
 *
 * Presence is DERIVED, never stored: it is exactly "does this account have a
 * live socket", and the socket map already knows. Nothing to write on connect,
 * nothing to prune on disconnect, and no state that can survive a crash and
 * report a ghost as online.
 *
 * Best-effort by contract, like statsRecorder: a Postgres outage means friends
 * appear offline, never that a connection is refused or a game is delayed.
 * Nothing here is awaited by a game path.
 */

const { io } = require('./initializeClient');
const { isDbEnabled } = require('./initializePgClient');
const friendsRepo = require('../data/friendsRepo');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * Every live socket belonging to an account, resolved NOW rather than assumed.
 *
 * A scan rather than a `user:<id>` room, which would be the idiomatic answer
 * anywhere else: room codes here are arbitrary strings (`validation.js` bounds
 * only the length), so `socket.join('user:<uuid>')` shares a namespace with
 * whatever players type into the join box — and anyone who knew a victim's id
 * could create that room and receive their traffic. Presence events are rare
 * and the socket map is small, so the scan costs nothing worth protecting.
 *
 * Moved here from statsRecorder, which now imports it: two copies of this
 * scan would be two places for the `user:<id>` shortcut to creep back in.
 */
const socketIdsOf = (userId) => {
    const ids = [];
    for (const [socketId, socket] of io.sockets.sockets) {
        if (socket?.data?.user?.id === userId) ids.push(socketId);
    }
    return ids;
};

/** Whether an account has any live socket at all. */
const isOnline = (userId) => socketIdsOf(userId).length > 0;

/**
 * The same question with one socket left out — the one that is leaving.
 *
 * By id rather than by count: whether the leaver is still in the map when a
 * handler runs depends on the disconnect path, and this answers the same
 * either way.
 */
const isOnlineExcept = (userId, exceptSocketId) =>
    socketIdsOf(userId).some((id) => id !== exceptSocketId);

/**
 * Whether this socket is the account's LAST one.
 *
 * The reason a disconnect cannot simply announce "offline": a player with the
 * game open in two tabs closes one, and their friends would watch them wink
 * out while they are still playing.
 */
const isLastSocketOf = (socket) => {
    const userId = socket?.data?.user?.id;
    if (!userId) return false;
    return !isOnlineExcept(userId, socket.id);
};

/** The subset of an account's friends who are on the site. */
const onlineFriendIds = async (userId) => {
    if (!isDbEnabled()) return [];
    const friendIds = await friendsRepo.listFriendIds(userId);
    return friendIds.filter(isOnline);
};

/** Emits to every live socket of one account. No-op if they have none. */
const emitToUser = (userId, event, payload) => {
    for (const socketId of socketIdsOf(userId)) {
        io.to(socketId).emit(event, payload);
    }
};

/**
 * Tell an arriving socket which of its friends are already here.
 *
 * A SNAPSHOT rather than a stream of deltas, because a client that just
 * connected has no prior state to apply deltas to — and one that reconnects
 * has state that may be arbitrarily stale.
 */
const sendPresenceSnapshot = async (socket) => {
    const userId = socket?.data?.user?.id;
    if (!userId || !isDbEnabled()) return;
    try {
        socket.emit(SERVER_EVENTS.FRIENDS_ONLINE, { ids: await onlineFriendIds(userId) });
    } catch (error) {
        console.error('Presence snapshot failed:', error.message);
    }
};

/**
 * Tell this account's online friends that it came or went.
 *
 * A DELTA here, unlike the snapshot: recomputing every recipient's whole list
 * would be one query per friend per connect, and the recipient already holds a
 * set to add to or remove from.
 *
 * Only friends who are ONLINE are told — an offline friend has no socket to
 * receive it, and will get a snapshot of their own when they arrive.
 *
 * `exceptSocketId` is the leaver on the disconnect path, so the recheck below
 * asks the same question this was called with rather than counting the socket
 * whose departure it is announcing.
 */
const announcePresence = async (userId, online, exceptSocketId) => {
    if (!userId || !isDbEnabled()) return;
    try {
        const friendIds = await friendsRepo.listFriendIds(userId);
        // The socket map moves while that query is in flight — a reload
        // reconnects inside it — and a stale `false` arriving after the new
        // socket's `true` leaves friends looking at a ghost. Re-read, and drop
        // an announcement the map no longer agrees with.
        if (isOnlineExcept(userId, exceptSocketId) !== online) return;
        for (const friendId of friendIds) {
            if (!isOnline(friendId)) continue;
            emitToUser(friendId, SERVER_EVENTS.FRIEND_PRESENCE, { id: userId, online });
        }
    } catch (error) {
        console.error('Presence announce failed:', error.message);
    }
};

/**
 * A socket arrived: catch it up, and tell its friends — but only if it is the
 * account's FIRST socket, or a second tab would announce an arrival for
 * somebody who never left.
 */
const onConnect = async (socket) => {
    try {
        const userId = socket?.data?.user?.id;
        if (!userId) return;                      // guests have no graph
        const alreadyHere = socketIdsOf(userId).some((id) => id !== socket.id);
        await sendPresenceSnapshot(socket);
        if (!alreadyHere) await announcePresence(userId, true);
    } catch (error) {
        // The contract in the header, enforced: presence is cosmetic, and
        // nothing about it may refuse a connection.
        console.error('Presence on connect failed:', error.message);
    }
};

/** A socket went: announce it only when the account has none left. */
const onDisconnect = async (socket) => {
    try {
        const userId = socket?.data?.user?.id;
        if (!userId || !isLastSocketOf(socket)) return;
        await announcePresence(userId, false, socket.id);
    } catch (error) {
        console.error('Presence on disconnect failed:', error.message);
    }
};

module.exports = {
    socketIdsOf,
    isOnline,
    isOnlineExcept,
    isLastSocketOf,
    onlineFriendIds,
    emitToUser,
    sendPresenceSnapshot,
    announcePresence,
    onConnect,
    onDisconnect,
};
