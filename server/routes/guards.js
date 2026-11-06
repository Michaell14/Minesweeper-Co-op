/**
 * Who is allowed to act on a room. A guard runs after validation and before
 * the handler, answering `{ ok, roomState }`; the state is passed back so a
 * handler needing the mode does not pay for a second read.
 *
 * The room guards run the IDENTICAL check and differ only in how they refuse
 * and how often they ask Redis. ROOM_MEMBER answers `roomDoesNotExistError`
 * and leaves the room, right for a click on a room that timed out.
 * ROOM_MEMBER_SILENT says nothing, right for hover and emotes: answering a
 * refusal on a spam surface hands a flooding client an amplifier, and evicting
 * would throw a legitimate player out over a cosmetic message.
 * ROOM_MEMBER_CACHED is the silent guard with its answer reused for a moment,
 * for the one route a client sends continuously.
 */

const roomRepo = require('../data/roomRepo');
const playerRepo = require('../data/playerRepo');
const { isPlayerInRoom } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * What membership needs from the room hash, and everything a handler may read
 * off the state a guard hands back: the mode, and the dimensions a ping is
 * bounded by (routes/social.js). Never the whole hash — it carries every board
 * in the room, three in PVP, and fetching it per hover and per click was most
 * of the server's Redis bandwidth. A handler needing more reads it itself,
 * which the board actions do anyway, under their lock.
 */
const MEMBERSHIP_FIELDS = ['players', 'mode', 'numRows', 'numCols'];

/**
 * How long ROOM_MEMBER_CACHED reuses an admission. Leaving voids one at once:
 * every exit (`removePlayer`, a refusing ROOM_MEMBER, a refused join) calls
 * `socket.leave`, and a pass only counts while socket.io still has the socket
 * in that room. The window bounds only what a leave cannot show, such as the
 * room hash expiring under a connected socket.
 */
const MEMBER_PASS_MS = 10000;

/** Admitted. Reads nothing — for routes that are not room-scoped at all. */
const none = async () => ({ ok: true });

/**
 * The check every room guard shares; returns the state it read so no wrapper
 * re-reads it. A missing room reads as no fields, and so as no players.
 */
const checkMembership = async (socket, room) => {
    const [roomState, playerExists] = await Promise.all([
        roomRepo.getFields(room, MEMBERSHIP_FIELDS),
        playerRepo.exists(socket.id),
    ]);
    if (!playerExists || !isPlayerInRoom(roomState, socket.id)) return { ok: false };

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
 * ROOM_MEMBER_SILENT, reusing an admission for MEMBER_PASS_MS. Hover arrives
 * ~10 times a second per player, so checking each one cost two Redis reads
 * per hover — at peak, most of the server's Redis operations — to re-prove
 * something that changes only on a join or leave. Only an admission is kept:
 * caching a refusal would ignore a player for the window after they join.
 * Monotonic clock, as the registrar's rate limiter uses.
 */
const roomMemberCached = async ({ socket, payload }) => {
    const now = performance.now();
    const pass = socket.data.memberPass;
    if (pass && pass.room === payload.room && now < pass.expiresAt && socket.rooms?.has(payload.room)) {
        return { ok: true, roomState: pass.roomState };
    }

    const result = await checkMembership(socket, payload.room);
    socket.data.memberPass = result.ok
        ? { room: payload.room, roomState: result.roomState, expiresAt: now + MEMBER_PASS_MS }
        : undefined;
    return result;
};

/**
 * Frozen so a row naming a guard that does not exist is `undefined` at
 * table-build time (caught by `routes.test.js`) rather than a string nothing matches.
 */
const GUARDS = Object.freeze({
    NONE: none,
    ROOM_MEMBER: roomMember,
    ROOM_MEMBER_SILENT: roomMemberSilent,
    ROOM_MEMBER_CACHED: roomMemberCached,
});

module.exports = { GUARDS, MEMBERSHIP_FIELDS, MEMBER_PASS_MS };
