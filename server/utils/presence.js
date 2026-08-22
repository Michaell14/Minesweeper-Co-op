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
 * The live socket map, indexed by account: `Map<userId, socketId[]>`.
 *
 * ONE pass, reused for every lookup the caller then makes. Built rather than
 * scanned per question because the questions come in bunches: announcing a
 * departure asks "is this friend online?" once per friend and then "which
 * sockets do they have?" for each one who is, so a scan per lookup made a
 * single connect O(friends x sockets) — at the 100-friend cap, two hundred
 * walks of the whole map, on the connection path. That is the shape of thing
 * that is free in testing and quadratic in production.
 */
const indexSocketsByUser = () => {
    const byUser = new Map();
    for (const [socketId, socket] of io.sockets.sockets) {
        const userId = socket?.data?.user?.id;
        if (!userId) continue;
        const existing = byUser.get(userId);
        if (existing) existing.push(socketId);
        else byUser.set(userId, [socketId]);
    }
    return byUser;
};

/**
 * Every live socket belonging to an account, resolved NOW rather than assumed.
 *
 * A scan rather than a `user:<id>` room, which would be the idiomatic answer
 * anywhere else: room codes here are arbitrary strings (`validation.js` bounds
 * only the length), so `socket.join('user:<uuid>')` shares a namespace with
 * whatever players type into the join box — and anyone who knew a victim's id
 * could create that room and receive their traffic.
 *
 * Moved here from statsRecorder, which now imports it: two copies of this
 * scan would be two places for the `user:<id>` shortcut to creep back in.
 * That caller asks once, on a rare unlock, so it pays for its own pass; the
 * presence paths below build the index instead.
 */
const socketIdsOf = (userId) => indexSocketsByUser().get(userId) ?? [];

/** Whether an account has any live socket at all. */
const isOnline = (userId) => socketIdsOf(userId).length > 0;

/**
 * Whether this socket is the account's LAST one.
 *
 * The reason a disconnect cannot simply announce "offline": a player with the
 * game open in two tabs closes one, and their friends would watch them wink
 * out while they are still playing. The disconnecting socket is still in the
 * map when this runs, so it is excluded by id rather than by count.
 */
const isLastSocketOf = (socket) => {
    const userId = socket?.data?.user?.id;
    if (!userId) return false;
    return socketIdsOf(userId).every((id) => id === socket.id);
};

/** The subset of an account's friends who are on the site. */
const onlineFriendIds = async (userId) => {
    if (!isDbEnabled()) return [];
    const friendIds = await friendsRepo.listFriendIds(userId);
    const byUser = indexSocketsByUser();
    return friendIds.filter((friendId) => byUser.has(friendId));
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
 */
const announcePresence = async (userId, online) => {
    if (!userId || !isDbEnabled()) return;
    try {
        const friendIds = await friendsRepo.listFriendIds(userId);
        // One index for the whole fan-out: both questions below — who is here,
        // and which sockets are theirs — are answered from it.
        const byUser = indexSocketsByUser();
        for (const friendId of friendIds) {
            for (const socketId of byUser.get(friendId) ?? []) {
                io.to(socketId).emit(SERVER_EVENTS.FRIEND_PRESENCE, { id: userId, online });
            }
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
        await announcePresence(userId, false);
    } catch (error) {
        console.error('Presence on disconnect failed:', error.message);
    }
};

module.exports = {
    indexSocketsByUser,
    socketIdsOf,
    isOnline,
    isLastSocketOf,
    onlineFriendIds,
    emitToUser,
    sendPresenceSnapshot,
    announcePresence,
    onConnect,
    onDisconnect,
};
