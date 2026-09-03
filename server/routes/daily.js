/**
 * The daily challenge. Every route is `GUARDS.NONE` by design: the daily is
 * not a room, so the room guard has nothing to check. Serialisation is per
 * attempt in `dailyRepo.withAttemptLock`. See ARCHITECTURE.md §5.
 */

const dailyGame = require('../game/daily');
const { startDaily, submitDailyScore, getDailyLeaderboard } = require('../controllers/dailyController');

/** The token is checked in the controller, which owns the attempt's lock. */
const start = async ({ socket, payload }) =>
    await startDaily({ socket, dailyAttemptToken: payload.dailyAttemptToken });

const open = async ({ socket, payload }) =>
    await dailyGame.openCell(payload.date, payload.dailyAttemptToken, socket.id, payload.row, payload.col);

const chord = async ({ socket, payload }) =>
    await dailyGame.chordCell(payload.date, payload.dailyAttemptToken, socket.id, payload.row, payload.col);

const flag = async ({ socket, payload }) =>
    await dailyGame.toggleFlag(payload.date, payload.dailyAttemptToken, socket.id, payload.row, payload.col);

const submit = async ({ socket, io, payload }) =>
    await submitDailyScore({
        socket,
        io,
        dailyAttemptToken: payload.dailyAttemptToken,
        date: payload.date,
        name: payload.name,
    });

const leaderboard = async ({ socket, payload }) => await getDailyLeaderboard({ socket, date: payload.date });

module.exports = { start, open, chord, flag, submit, leaderboard };
