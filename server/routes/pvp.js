/**
 * PVP lifecycle — start, per-player reset, rematch.
 *
 * Thin by design: the flows live in `controllers/pvpController.js`. What these
 * add is the shape the registrar expects. The room code check and the
 * membership check that each controller used to run itself are now the row's
 * `validate` and `guard`, which is why the controllers no longer take `isValid`.
 */

const { startPvpGame, resetMyBoard, pvpRematch } = require('../controllers/pvpController');

const start = async ({ socket, io, payload }) => await startPvpGame({ socket, room: payload.room, io });

const resetBoard = async ({ socket, io, payload }) => await resetMyBoard({ socket, room: payload.room, io });

const rematch = async ({ socket, io, payload }) => await pvpRematch({ socket, room: payload.room, io });

module.exports = { start, resetBoard, rematch };
