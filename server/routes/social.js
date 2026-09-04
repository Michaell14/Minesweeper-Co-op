/**
 * Reactions, pings and cursor presence — the three messages a client sends
 * that fan out to the room on its own say-so. All are rate-limited (buckets
 * declared in the table, applied by the registrar; `sendEmote` and `pingCell`
 * share ONE bucket, see domain/rateLimit.js) and all use ROOM_MEMBER_SILENT: a
 * refusal must neither answer with an error (an amplifier) nor evict the
 * sender. All three stamp their room, since a relay in flight when its
 * recipient leaves is still delivered.
 */

const playerRepo = require('../data/playerRepo');
const { isCoordinateOnBoard } = require('../validation');
const { SERVER_EVENTS } = require('../../shared/events');

/** NOT gated on mode: unlike a hover, an emote carries no board information. */
const emote = async ({ socket, io, payload }) => {
    const playerName = await playerRepo.getName(socket.id);
    if (!playerName) return;

    io.to(payload.room).emit(SERVER_EVENTS.PLAYER_EMOTE, {
        id: socket.id,
        name: playerName,
        emote: payload.emote,
        room: payload.room,
    });
};

/**
 * Somebody pointed at a cell. SUPPRESSED IN PVP like hover: both racers play
 * the SAME board, so a ping is a move hint on the opponent's screen. Bounded
 * against THIS room's board as well as the table's global range, since a ping
 * is relayed raw. Unlike hover there is no (-1,-1) clear; a ping expires.
 */
const ping = async ({ socket, io, payload, roomState }) => {
    if (!isCoordinateOnBoard(roomState, payload.row, payload.col)) return;
    if (roomState.mode === 'pvp') return;

    const playerName = await playerRepo.getName(socket.id);
    if (!playerName) return;

    io.to(payload.room).emit(SERVER_EVENTS.PLAYER_PING, {
        id: socket.id,
        name: playerName,
        row: payload.row,
        col: payload.col,
        room: payload.room,
    });
};

/** Co-op only: where an opponent is looking is information about the shared board. */
const hover = async ({ socket, payload, roomState }) => {
    if (roomState.mode === 'pvp') return;

    const playerName = await playerRepo.getName(socket.id);
    if (!playerName) return;

    // `socket.to`, not `io.to` — everyone else in the room, not the sender.
    socket.to(payload.room).emit(SERVER_EVENTS.PLAYER_HOVER_UPDATE, {
        id: socket.id,
        row: payload.row,
        col: payload.col,
        name: playerName,
    });
};

module.exports = { emote, ping, hover };
