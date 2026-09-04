/**
 * Quick match and the practice race: pre-room actions, so no room code and no
 * room guard. Each controller validates the name itself and answers a refusal
 * with `matchError`, so no row declares a `validate`.
 */

const { findMatch, cancelMatch, startPracticeRace } = require('../controllers/matchmakingController');

const find = async ({ socket, payload }) => await findMatch({ socket, name: payload.name });

const cancel = async ({ socket }) => await cancelMatch({ socket });

const practice = async ({ socket, payload }) => await startPracticeRace({ socket, name: payload.name });

module.exports = { find, cancel, practice };
