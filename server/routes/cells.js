/**
 * Cell actions and the room-wide controls beside them.
 *
 * Every route here is guarded by ROOM_MEMBER and validated for a room code and
 * a coordinate, so by the time a handler runs the room exists, the sender is in
 * it, and the numbers are in range. What is left is the call itself — which is
 * why these are one-liners.
 *
 * Mode dispatch is NOT here: `game/index.js` is the only place that decides
 * whether an action is co-op or PVP, and it takes the lock that goes with it.
 */

const { openCell, chordCell, toggleFlag } = require('../game');
const { resetGame } = require('../utils/gameUtils');
const { SERVER_EVENTS } = require('../../shared/events');

const open = async ({ socket, payload }) =>
    await openCell(payload.row, payload.col, payload.room, socket.id);

const chord = async ({ socket, payload }) =>
    await chordCell(payload.row, payload.col, payload.room, socket.id);

const flag = async ({ socket, payload }) =>
    await toggleFlag(payload.row, payload.col, payload.room, socket.id);

const reset = async ({ payload }) => await resetGame(payload.room);

/** Cosmetic, and deliberately fanned out to the sender as well as the room. */
const confetti = async ({ io, payload }) =>
    io.to(payload.room).emit(SERVER_EVENTS.RECEIVE_CONFETTI);

module.exports = { open, chord, flag, reset, confetti };
