/**
 * Quick match and the practice race.
 *
 * Pre-room actions, so none of them takes a room code and none can use a room
 * guard. Each controller validates the name itself and answers a refusal with
 * `matchError`, which is why no row here declares a `validate` — a silent drop
 * would leave the landing page spinning.
 */

const { findMatch, cancelMatch, startPracticeRace } = require('../controllers/matchmakingController');

const find = async ({ socket, payload }) => await findMatch({ socket, name: payload.name });

const cancel = async ({ socket }) => await cancelMatch({ socket });

const practice = async ({ socket, payload }) => await startPracticeRace({ socket, name: payload.name });

module.exports = { find, cancel, practice };
