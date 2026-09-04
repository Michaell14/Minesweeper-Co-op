/**
 * The three friend messages that travel over the socket rather than the REST
 * surface in `controllers/friendsController.js`: all three are ROOM-scoped,
 * while the graph itself stays on `/api/friends`. Every row takes
 * ROOM_MEMBER_SILENT, not for spam but so a refusal here is indistinguishable
 * from "not their friend", "blocked" or "not online", which are all silent.
 * The controllers re-read the room state the guard saw, so each is testable
 * without a guard in front of it.
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
