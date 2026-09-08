/**
 * "Add the people you just played with" — the third and narrowest door onto
 * the friend graph, after the code and the reciprocal accept: a game just
 * finished together is the one moment two strangers have a reason to add each
 * other, and a code read out loud would not survive it.
 *
 * Account ids never leave the server. The client addresses a co-player by
 * SOCKET id, which it already sees on every hover, and this file resolves the
 * account; account ids in the roster would hand everyone a permanent handle
 * for everyone else. The offer covers only players STILL CONNECTED, because
 * the account is resolved from the live socket.
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
 * What the asking user may do about each co-player. A BLOCK in either
 * direction returns null and the player is left out entirely: a block placed
 * on you is invisible everywhere else, and a silently failing button would be
 * the one place it leaked.
 */
const statusFor = (edge) => {
    if (!edge) return 'none';
    if (edge.status === friendsRepo.STATUS.blocked) return null;
    if (edge.status === friendsRepo.STATUS.accepted) return 'friends';
    return edge.direction === 'outgoing' ? 'requested' : 'incoming';
};

/**
 * The signed-in, still-connected players in this room, other than the asker.
 * Sent to the ASKER alone, so "me" is excluded here rather than by the client.
 */
const sendRoomFriends = async (socket, room, token) => {
    const me = socket.data?.user;
    if (!me || !isDbEnabled()) return;
    if (!isValidRoomCode(room)) return;

    const roomState = await roomRepo.getState(room);
    if (!roomState || !isPlayerInRoom(roomState, socket.id)) return;

    /*
     * Resolve every candidate, then one edge query for all of them: a co-op
     * room has no size limit. The name is the ACCOUNT's, which is the same
     * string a signed-in player is stored under (utils/playerIdentity.js).
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
     * Stamped with the room and the token that asked. These emits are ordered
     * by when their database work FINISHES, so an older list can land on top
     * of a newer one (from a room since left, or from before an add already
     * made); the client drops both, and needs room and token to tell.
     */
    socket.emit(SERVER_EVENTS.ROOM_FRIENDS_UPDATE, { room, token, players });
};

/**
 * Send a request to somebody in this room, or accept theirs (`requestFriend`
 * folds that in). Answers by re-sending the whole list, so the client never
 * holds two sources of truth. Every refusal is silent: a block must not be
 * distinguishable from anything else.
 */
const addRoomFriend = async (socket, { room, playerId, token }) => {
    const me = socket.data?.user;
    if (!me || !isDbEnabled()) return;
    if (!isValidRoomCode(room) || typeof playerId !== 'string' || playerId === socket.id) return;
    if (!isValidRequestToken(token)) return;

    try {
        const roomState = await roomRepo.getState(room);
        // BOTH have to be in the room, or this adds any account whose socket id you can name.
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
