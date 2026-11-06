/**
 * Reactions, pings and cursor presence — the three messages a client sends
 * that fan out to the room on its own say-so. All are rate-limited (buckets
 * declared in the table, applied by the registrar; `sendEmote` and `pingCell`
 * share ONE bucket, see domain/rateLimit.js) and all use a silent guard: a
 * refusal must neither answer with an error (an amplifier) nor evict the
 * sender; hover's reuses its admission, since it is sent continuously. All
 * three stamp their room, since a relay in flight when its recipient leaves is
 * still delivered.
 */

const playerRepo = require('../data/playerRepo');
const { isCoordinateOnBoard } = require('../validation');
const { MEMBER_PASS_MS } = require('./guards');
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

/**
 * The sender's name, kept for as long as the guard keeps its admission. A name
 * is fixed when its player joins and hover asks ~10 times a second, so reading
 * it each time was a Redis round trip per mouse move; a rejoin under a new
 * name shows within one pass.
 */
const hoverNameOf = async (socket, room) => {
    const now = performance.now();
    const cached = socket.data.hoverName;
    if (cached && cached.room === room && now < cached.expiresAt) return cached.name;

    const name = await playerRepo.getName(socket.id);
    socket.data.hoverName = name ? { room, name, expiresAt: now + MEMBER_PASS_MS } : undefined;
    return name;
};

/** Co-op only: where an opponent is looking is information about the shared board. */
const hover = async ({ socket, payload, roomState }) => {
    if (roomState.mode === 'pvp') return;

    const playerName = await hoverNameOf(socket, payload.room);
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
