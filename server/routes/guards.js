/**
 * Who is allowed to act on a room.
 *
 * A guard runs after the payload has been validated and before the handler, and
 * answers `{ ok, roomState }`. The room state is passed back rather than
 * discarded: the guard has already read it, and a handler that needs the mode
 * would otherwise pay for a second read to learn what the guard just saw.
 *
 * The two room guards run the IDENTICAL check and differ only in how they
 * refuse. Both are needed:
 *
 *   ROOM_MEMBER         answers with `roomDoesNotExistError` and leaves the
 *                       room — right for a click on a room that timed out and
 *                       was deleted, where the client is showing a board that
 *                       no longer exists and needs to be told.
 *
 *   ROOM_MEMBER_SILENT  refuses and says nothing — right for hover and emotes.
 *                       They are continuous, rate-limited, client-driven spam
 *                       surfaces: answering a refusal with an emit hands a
 *                       flooding client an amplifier, and evicting the sender
 *                       would throw a legitimate player out of a live game over
 *                       a cosmetic message.
 */

const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { isPlayerInRoom } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/** Admitted. Reads nothing — for routes that are not room-scoped at all. */
const none = async () => ({ ok: true });

/**
 * The check both room guards share: the room is there, the player record is
 * there, and that player is listed in the room.
 *
 * Returns the room state on success so neither wrapper re-reads it.
 */
const checkMembership = async (socket, room) => {
    const [roomExists, playerExists] = await Promise.all([
        roomRepo.exists(room),
        playerRepo.exists(socket.id),
    ]);
    if (!roomExists || !playerExists) return { ok: false };

    const roomState = await roomRepo.getState(room);
    if (!isPlayerInRoom(roomState, socket.id)) return { ok: false };

    return { ok: true, roomState };
};

const roomMember = async ({ socket, payload }) => {
    const result = await checkMembership(socket, payload.room);
    if (!result.ok) {
        socket.emit(SERVER_EVENTS.ROOM_DOES_NOT_EXIST_ERROR);
        socket.leave(payload.room);
    }
    return result;
};

const roomMemberSilent = async ({ socket, payload }) => await checkMembership(socket, payload.room);

/**
 * Frozen so a row cannot name a guard that does not exist — `GUARDS.ROOM_MEMBR`
 * is `undefined` at table-build time, which `routes.test.js` catches, rather
 * than a string nothing matches at request time.
 */
const GUARDS = Object.freeze({
    NONE: none,
    ROOM_MEMBER: roomMember,
    ROOM_MEMBER_SILENT: roomMemberSilent,
});

module.exports = { GUARDS };
