/**
 * PVP lifecycle: start, per-player reset, rematch. Thin: the flows live in
 * `controllers/pvpController.js`; room code and membership are the row's `validate` and `guard`.
 */

const { startPvpGame, resetMyBoard, pvpRematch } = require('../controllers/pvpController');

const start = async ({ socket, io, payload }) => await startPvpGame({ socket, room: payload.room, io });

const resetBoard = async ({ socket, io, payload }) => await resetMyBoard({ socket, room: payload.room, io });

const rematch = async ({ socket, io, payload }) => await pvpRematch({ socket, room: payload.room, io });

module.exports = { start, resetBoard, rematch };
