/**
 * Who is allowed to act on a room. A guard runs after validation and before
 * the handler, answering `{ ok, roomState }`; the state is passed back so a
 * handler needing the mode does not pay for a second read.
 *
 * The two room guards run the IDENTICAL check and differ only in how they
 * refuse. ROOM_MEMBER answers `roomDoesNotExistError` and leaves the room,
 * right for a click on a room that timed out. ROOM_MEMBER_SILENT says nothing,
 * right for hover and emotes: answering a refusal on a spam surface hands a
 * flooding client an amplifier, and evicting would throw a legitimate player
 * out over a cosmetic message.
 */

const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { isPlayerInRoom } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/** Admitted. Reads nothing — for routes that are not room-scoped at all. */
const none = async () => ({ ok: true });

/** The check both room guards share; returns the room state so neither wrapper re-reads it. */
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
 * Frozen so a row naming a guard that does not exist is `undefined` at
 * table-build time (caught by `routes.test.js`) rather than a string nothing matches.
 */
const GUARDS = Object.freeze({
    NONE: none,
    ROOM_MEMBER: roomMember,
    ROOM_MEMBER_SILENT: roomMemberSilent,
});

module.exports = { GUARDS };
