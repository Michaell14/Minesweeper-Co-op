/**
 * Cell actions and the room-wide controls beside them. Every route is guarded
 * by ROOM_MEMBER and validated, so only the call is left. Mode dispatch lives
 * in `game/index.js`, which takes the matching lock.
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

/** Cosmetic; fanned out to the sender as well as the room. */
const confetti = async ({ io, payload }) =>
    io.to(payload.room).emit(SERVER_EVENTS.RECEIVE_CONFETTI);

module.exports = { open, chord, flag, reset, confetti };
