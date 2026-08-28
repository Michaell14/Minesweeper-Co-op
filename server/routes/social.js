/**
 * Reactions and cursor presence — the two messages a client sends that fan out
 * to the room on its own say-so.
 *
 * Both are rate-limited and both use ROOM_MEMBER_SILENT, which is the whole
 * reason that guard exists: a refusal here must never answer with an error
 * (that hands a flooding client an amplifier) and must never evict the sender
 * (a refused cosmetic message must not end someone's game).
 *
 * The buckets themselves are declared in the table and applied by the
 * registrar, before either of these is reached.
 */

const playerRepo = require('../data/playerRepo');
const { SERVER_EVENTS } = require('../../shared/events');

/**
 * NOT gated on mode. Unlike a hover, an emote carries no board information, so
 * racers on the same PVP board may taunt each other without either learning
 * anything about the mines.
 */
const emote = async ({ socket, io, payload }) => {
    const playerName = await playerRepo.getName(socket.id);
    if (!playerName) return;

    io.to(payload.room).emit(SERVER_EVENTS.PLAYER_EMOTE, {
        id: socket.id,
        name: playerName,
        emote: payload.emote,
    });
};

/**
 * Co-op only. PVP racers must not see each other's cursor — where an opponent
 * is looking is information about the board they share.
 *
 * The room state comes from the guard, which already read it.
 */
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

module.exports = { emote, hover };
