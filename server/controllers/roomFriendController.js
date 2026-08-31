/**
 * "Add the people you just played with" — the third and narrowest door onto the
 * friend graph, after the code and the reciprocal accept.
 *
 * It exists because a code nobody has a reason to swap is a code nobody swaps.
 * A game you just finished together is the one moment two strangers have a
 * reason to, and the friend code was never going to survive being read out
 * loud at that moment.
 *
 * **Account ids never leave the server.** The client addresses a co-player by
 * SOCKET id — something it already sees on every hover, reaction and ping — and
 * this file turns that back into an account. The alternative, putting account
 * ids in the room roster, would hand every player in a room a permanent handle
 * for everybody else, which is exactly what the code-only rule exists to avoid.
 *
 * The offer only covers players who are STILL CONNECTED, because the account is
 * resolved from the live socket. Somebody who closed their tab the moment the
 * race ended cannot be added — the list simply does not include them, which is
 * honest, rather than a button that silently does nothing.
 */

const { io } = require('../utils/initializeClient');
const { isDbEnabled } = require('../utils/initializePgClient');
const roomRepo = require('../data/roomRepo');
const friendsRepo = require('../data/friendsRepo');
const { isValidRoomCode, isPlayerInRoom, isValidRequestToken } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/** The account on a live socket, or null for a guest or a socket that is gone. */
const accountOf = (socketId) => io.sockets.sockets.get(socketId)?.data?.user ?? null;

/**
 * What the asking user may do about each co-player, from the one edge between
 * them.
 *
 * A BLOCK in either direction returns null and the player is left out of the
 * list entirely: a block placed on you is invisible everywhere else, and an
 * "Add friend" button that silently fails would be the one place it leaked.
 */
const statusFor = (edge) => {
    if (!edge) return 'none';
    if (edge.status === friendsRepo.STATUS.blocked) return null;
    if (edge.status === friendsRepo.STATUS.accepted) return 'friends';
    return edge.direction === 'outgoing' ? 'requested' : 'incoming';
};

/**
 * The signed-in, still-connected players in this room, other than the asker.
 *
 * Sent to the ASKER alone, which is what lets "me" be excluded here rather than
 * by a client comparing socket ids it would first have to be told.
 */
const sendRoomFriends = async (socket, room, token) => {
    const me = socket.data?.user;
    if (!me || !isDbEnabled()) return;
    if (!isValidRoomCode(room)) return;

    const roomState = await roomRepo.getState(room);
    if (!roomState || !isPlayerInRoom(roomState, socket.id)) return;

    /*
     * Resolve every candidate first, then ask about all of them at once. A
     * co-op room has no size limit, so the obvious loop — one edge query per
     * player — is a query per player every time a game ends.
     *
     * The name is the ACCOUNT's rather than the room record's, which is both
     * cheaper and the same string: a signed-in player is stored in a room
     * under their account name (utils/playerIdentity.js), and everybody in
     * this list is signed in by construction.
     */
    const playerIds = await roomRepo.getPlayers(room);
    const candidates = [];
    for (const playerId of playerIds || []) {
        if (playerId === socket.id) continue;
        const account = accountOf(playerId);
        if (!account) continue;                      // a guest, or already gone
        if (account.id === me.id) continue;          // the same account, second tab
        candidates.push({ playerId, account });
    }

    const edges = await friendsRepo.findEdges(me.id, candidates.map(({ account }) => account.id));

    const players = [];
    for (const { playerId, account } of candidates) {
        const status = statusFor(edges.get(account.id) ?? null);
        if (status === null) continue;               // blocked, either way

        players.push({
            id: playerId,
            name: account.displayName,
            avatar: account.avatar ?? null,
            status,
        });
    }

    /*
     * Stamped with the room it describes and the token that asked for it.
     * These emits are ordered by when their Redis and Postgres work FINISHES,
     * not by when they were asked for, so an older list can land on top of a
     * newer one: from a room the player has since left (offering strangers
     * from the last game), or from before an add they have already made
     * (putting "Add friend" back under somebody they just added). The client
     * drops both, and needs the room and the token to tell.
     */
    socket.emit(SERVER_EVENTS.ROOM_FRIENDS_UPDATE, { room, token, players });
};

/**
 * Send a request to somebody in this room — or accept theirs, which
 * `requestFriend` already folds in.
 *
 * Answers by re-sending the whole list rather than a per-player result, so the
 * client never holds two sources of truth about one relationship. Every
 * refusal is silent for the same reason as everywhere else in this feature: a
 * block must not be distinguishable from anything else.
 */
const addRoomFriend = async (socket, { room, playerId, token }) => {
    const me = socket.data?.user;
    if (!me || !isDbEnabled()) return;
    if (!isValidRoomCode(room) || typeof playerId !== 'string' || playerId === socket.id) return;
    if (!isValidRequestToken(token)) return;

    try {
        const roomState = await roomRepo.getState(room);
        // BOTH have to be in the room. Without the second check this is a way
        // to add any account whose socket id you can name.
        if (!roomState || !isPlayerInRoom(roomState, socket.id)) return;
        if (!isPlayerInRoom(roomState, playerId)) return;

        const them = accountOf(playerId);
        if (!them || them.id === me.id) return;

        await friendsRepo.requestFriend(me.id, them.id);
        await sendRoomFriends(socket, room, token);
    } catch (error) {
        console.error('Error adding a friend from a room:', error.message);
    }
};

/** The list, on request. Its own wrapper so the socket handler stays one line. */
const roomFriends = async (socket, { room, token }) => {
    try {
        if (!isValidRequestToken(token)) return;
        await sendRoomFriends(socket, room, token);
    } catch (error) {
        console.error('Error listing room friends:', error.message);
    }
};

module.exports = { roomFriends, addRoomFriend };
