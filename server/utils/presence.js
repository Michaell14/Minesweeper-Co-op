/**
 * Which friends are on the site, and telling them about you. Presence is
 * DERIVED from the live socket map, never stored: nothing is written on
 * connect, pruned on disconnect, or survives a crash as a ghost. Best-effort
 * like statsRecorder: a Postgres outage makes friends appear offline, never
 * refuses a connection or delays a game.
 */

const { io } = require('./initializeClient');
const { isDbEnabled } = require('./initializePgClient');
const friendsRepo = require('../data/friendsRepo');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * The live socket map indexed by account: `Map<userId, [socketId, socket][]>`.
 * One pass reused for a bunch of lookups; a scan per lookup made a connect
 * O(friends x sockets). Entries rather than ids because `isOnlineExcept`
 * compares socket instances.
 */
const indexSocketsByUser = () => {
    const byUser = new Map();
    for (const [socketId, socket] of io.sockets.sockets) {
        const userId = socket?.data?.user?.id;
        if (!userId) continue;
        const existing = byUser.get(userId);
        if (existing) existing.push([socketId, socket]);
        else byUser.set(userId, [[socketId, socket]]);
    }
    return byUser;
};

/**
 * Every live socket of an account, resolved now. A scan rather than a
 * `user:<id>` room: room codes are arbitrary strings, so anyone who knew a
 * victim's id could create that room and receive their traffic. statsRecorder
 * imports this rather than keeping a copy, so the shortcut has one place to creep back in.
 */
const socketEntriesOf = (userId) => indexSocketsByUser().get(userId) ?? [];

const socketIdsOf = (userId) => socketEntriesOf(userId).map(([socketId]) => socketId);

/** The same scan, as instances — what identity comparisons need. */
const socketsOf = (userId) => socketEntriesOf(userId).map(([, socket]) => socket);

/** Whether an account has any live socket at all. */
const isOnline = (userId) => socketIdsOf(userId).length > 0;

/**
 * `isOnline` with one socket (the leaver) left out. By INSTANCE, not id:
 * `connectionStateRecovery` brings a reconnect back under the SAME id, so
 * excluding by id would report a player who is still here as gone.
 */
const isOnlineExcept = (userId, exceptSocket) =>
    socketsOf(userId).some((socket) => socket !== exceptSocket);

/** Whether this socket is the account's LAST one, so closing one of two tabs is not "offline". */
const isLastSocketOf = (socket) => {
    const userId = socket?.data?.user?.id;
    if (!userId) return false;
    return !isOnlineExcept(userId, socket);
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
 * Tells an arriving socket which friends are already here. A SNAPSHOT, not
 * deltas: a fresh client has no state to apply them to, and a reconnect's may be stale.
 */
const sendPresenceSnapshot = async (socket) => {
    const userId = socket?.data?.user?.id;
    if (!userId) return;

    let ids = [];
    try {
        ids = await onlineFriendIds(userId);
    } catch (error) {
        // Fall through to an EMPTY snapshot. Silence would leave a reconnecting
        // client's stale list uncorrected, with dead invites beside friends long
        // gone; empty is what the header's contract promises for an outage.
        console.error('Presence snapshot failed, sending an empty one:', error.message);
    }
    socket.emit(SERVER_EVENTS.FRIENDS_ONLINE, { ids });
};

/**
 * Tells this account's online friends it came or went. A DELTA, unlike the
 * snapshot: recipients already hold a set. Offline friends get their own
 * snapshot on arrival. `exceptSocket` is the leaver on the disconnect path.
 */
const announcePresence = async (userId, online, exceptSocket) => {
    if (!userId || !isDbEnabled()) return;
    try {
        const friendIds = await friendsRepo.listFriendIds(userId);
        // The map moves while the query is in flight (a reload reconnects inside
        // it); drop an announcement it no longer agrees with, or friends see a ghost.
        if (isOnlineExcept(userId, exceptSocket) !== online) return;
        // One index for the whole fan-out, not a walk per friend.
        const byUser = indexSocketsByUser();
        for (const friendId of friendIds) {
            for (const [socketId] of byUser.get(friendId) ?? []) {
                io.to(socketId).emit(SERVER_EVENTS.FRIEND_PRESENCE, { id: userId, online });
            }
        }
    } catch (error) {
        console.error('Presence announce failed:', error.message);
    }
};

/** A socket arrived: catch it up, and tell friends only if it is the account's FIRST socket. */
const onConnect = async (socket) => {
    try {
        const userId = socket?.data?.user?.id;
        if (!userId) return;                      // guests have no graph
        const alreadyHere = socketsOf(userId).some((other) => other !== socket);
        await sendPresenceSnapshot(socket);
        if (!alreadyHere) await announcePresence(userId, true);
    } catch (error) {
        // Presence is cosmetic; nothing about it may refuse a connection.
        console.error('Presence on connect failed:', error.message);
    }
};

/** A socket went: announce it only when the account has none left. */
const onDisconnect = async (socket) => {
    try {
        const userId = socket?.data?.user?.id;
        if (!userId || !isLastSocketOf(socket)) return;
        await announcePresence(userId, false, socket);
    } catch (error) {
        console.error('Presence on disconnect failed:', error.message);
    }
};

module.exports = {
    indexSocketsByUser,
    socketsOf,
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
