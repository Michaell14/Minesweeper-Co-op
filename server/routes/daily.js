/**
 * The daily challenge.
 *
 * Every route here is `GUARDS.NONE`, and that is the design rather than an
 * omission: the daily is NOT a room. It is addressed by UTC date plus an opaque
 * browser token, has no membership list and nothing to broadcast, so the room
 * guard has nothing to check. Its own serialisation is per attempt, inside
 * `dailyRepo.withAttemptLock`. See ARCHITECTURE.md §5.
 */

const dailyGame = require('../game/daily');
const { startDaily, submitDailyScore, getDailyLeaderboard } = require('../controllers/dailyController');

/** The token is checked inside the controller, which owns the attempt's lock. */
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
