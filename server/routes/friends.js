/**
 * The three friend messages that travel over the socket rather than the REST
 * surface in `controllers/friendsController.js`.
 *
 * They are here, not there, because all three are ROOM-scoped: they name the
 * room the sender is in, and mean nothing without it. The graph itself — the
 * code, the request, the accept, the block — is account-scoped and stays on
 * `/api/friends`, where a page can ask for it without a game in progress.
 *
 * Every row behind these takes ROOM_MEMBER_SILENT. That is not the usual
 * spam-surface reason: it is that a refusal here must not be distinguishable
 * from any other. "You are not their friend", "they blocked you" and "they are
 * not online" are all silent in the controllers, and answering the enclosing
 * room check with an error would leak the one thing the rest of the feature is
 * careful not to.
 *
 * The controllers re-read the room state the guard already saw. That is
 * deliberate rather than an oversight to tidy: each one is reachable from its
 * own tests without a guard in front of it, and their checks are the ones the
 * feature's refusals are specified against.
 */

const { inviteFriend } = require('../controllers/friendInviteController');
const { roomFriends, addRoomFriend } = require('../controllers/roomFriendController');

/** "Come play with me" — see controllers/friendInviteController.js. */
const invite = async ({ socket, payload }) =>
    await inviteFriend(socket, { friendId: payload.friendId, room: payload.room });

/** Who in this room could be added, asked for as a game ends. */
const list = async ({ socket, payload }) =>
    await roomFriends(socket, { room: payload.room, token: payload.token });

/** Send a request to one of them — or accept theirs, which the repo folds in. */
const add = async ({ socket, payload }) =>
    await addRoomFriend(socket, { room: payload.room, playerId: payload.playerId, token: payload.token });

module.exports = { invite, list, add };
