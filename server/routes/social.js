/**
 * Reactions, pings and cursor presence — the three messages a client sends that
 * fan out to the room on its own say-so.
 *
 * All three are rate-limited and all three use ROOM_MEMBER_SILENT, which is the
 * whole reason that guard exists: a refusal here must never answer with an
 * error (that hands a flooding client an amplifier) and must never evict the
 * sender (a refused cosmetic message must not end someone's game).
 *
 * The buckets themselves are declared in the table and applied by the
 * registrar, before any of these is reached. `sendEmote` and `pingCell` share
 * ONE bucket — see domain/rateLimit.js for why two would be a hole.
 *
 * All three stamp the room they came from. These relays are ordered by when
 * their Redis work finishes, so one already in flight when its recipient leaves
 * is still delivered; without the room the client cannot tell it from a message
 * belonging to the room they joined next.
 */

const playerRepo = require('../data/playerRepo');
const { isCoordinateOnBoard } = require('../validation');
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
        room: payload.room,
    });
};

/**
 * Somebody pointed at a cell.
 *
 * SUPPRESSED IN PVP, exactly like hover and unlike an emote. Both racers play
 * the SAME board (see startPvpGame), so a cell somebody points at is a move
 * hint delivered straight to their opponent's screen — "this one is safe" or
 * "this one is a mine" is the entire content of a ping. An emote carries no
 * such thing, which is why it has no gate here.
 *
 * Bounded against THIS room's board as well as the table's global range: a ping
 * is relayed raw for clients to draw and announce, so 0..100 is not enough on a
 * small board. The room state comes from the guard, which already read it.
 *
 * Unlike hover there is no (-1,-1) clear to accept — a ping is a point at
 * something, and it expires on its own.
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

module.exports = { emote, ping, hover };
