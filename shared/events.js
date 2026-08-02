/**
 * The socket protocol's event names — the one copy.
 *
 * Imported by BOTH halves: the client via `@/shared/events`, the server via
 * `require('../shared/events')`. CommonJS so it works untouched from the CJS
 * server and from the bundler. Viable only because the whole repo deploys, the
 * same as shared/boardConfig — see ARCHITECTURE.md §6.
 *
 * A typed-out literal produces an event nobody listens to and no error anywhere,
 * so `server/tests/events.test.js` enforces that the server uses these constants.
 *
 * Payload shapes live in `shared/socketPayloads.ts`, which binds the client only
 * — this file stays plain JS because the server requires it at runtime.
 *
 * **`Object.freeze` is load-bearing, not defensive.** TypeScript widens a plain
 * object's string properties to `string`, too wide to look a payload up by:
 * `{ [SERVER_EVENTS.BOARD_UPDATE]: handler }` would key on a plain string and the
 * handler's argument would fall back to `any`. Frozen, it infers the literal
 * `'boardUpdate'`, which is what type-checks the table in useGameEvents.ts — and
 * is why no hand-written `events.d.ts` is needed.
 */

/** Client -> server. Every one is a `socket.on` handler in server/server.js. */
const CLIENT_EVENTS = Object.freeze({
    CREATE_ROOM: 'createRoom',
    JOIN_ROOM: 'joinRoom',
    OPEN_CELL: 'openCell',
    CHORD_CELL: 'chordCell',
    TOGGLE_FLAG: 'toggleFlag',
    EMIT_CONFETTI: 'emitConfetti',
    CELL_HOVER: 'cellHover',
    RESET_GAME: 'resetGame',
    START_PVP_GAME: 'startPvpGame',
    RESET_MY_BOARD: 'resetMyBoard',
    PVP_REMATCH: 'pvpRematch',
    PLAYER_LEAVE: 'playerLeave',

    // Daily challenge -- NOT room-scoped, addressed by date + attempt token.
    // See server/data/keys.js for why this is a separate system from rooms.
    START_DAILY: 'startDaily',
    DAILY_OPEN_CELL: 'dailyOpenCell',
    DAILY_CHORD_CELL: 'dailyChordCell',
    DAILY_TOGGLE_FLAG: 'dailyToggleFlag',
    SUBMIT_DAILY_SCORE: 'submitDailyScore',
    GET_DAILY_LEADERBOARD: 'getDailyLeaderboard',
});

/** Server -> client. Every one has a handler in hooks/useGameEvents.ts. */
const SERVER_EVENTS = Object.freeze({
    // Room lifecycle
    JOIN_ROOM_SUCCESS: 'joinRoomSuccess',
    JOIN_ROOM_ERROR: 'joinRoomError',
    CREATE_ROOM_ERROR: 'createRoomError',
    ROOM_DOES_NOT_EXIST_ERROR: 'roomDoesNotExistError',

    // Board and scores
    BOARD_UPDATE: 'boardUpdate',
    UPDATE_CELLS: 'updateCells',
    PLAYER_STATS_UPDATE: 'playerStatsUpdate',

    // Win / loss
    GAME_WON: 'gameWon',
    GAME_OVER: 'gameOver',
    RESET_EVERYONE: 'resetEveryone',

    // Presence and fun
    RECEIVE_CONFETTI: 'receiveConfetti',
    PLAYER_HOVER_UPDATE: 'playerHoverUpdate',
    GAME_CLOCK: 'gameClock',
    SESSION_RESUME: 'sessionResume',
    PLAYER_LEFT: 'playerLeft',

    // PVP
    PVP_ROOM_FULL: 'pvpRoomFull',
    PVP_ROOM_READY: 'pvpRoomReady',
    PVP_GAME_STARTED: 'pvpGameStarted',
    PVP_BOARD_UPDATE: 'pvpBoardUpdate',
    PVP_UPDATE_CELLS: 'pvpUpdateCells',
    PVP_GAME_OVER: 'pvpGameOver',
    PVP_OPPONENT_FAILED: 'pvpOpponentFailed',
    PVP_OPPONENT_RESET: 'pvpOpponentReset',
    PVP_PLAYER_WON: 'pvpPlayerWon',
    PVP_OPPONENT_PROGRESS: 'pvpOpponentProgress',
    PVP_OPPONENT_DISCONNECTED: 'pvpOpponentDisconnected',
    PVP_OPPONENT_LEFT_BEFORE_START: 'pvpOpponentLeftBeforeStart',
    PVP_HOST_TRANSFERRED: 'pvpHostTransferred',
    PVP_REMATCH_STARTED: 'pvpRematchStarted',

    // Daily challenge
    DAILY_STARTED: 'dailyStarted',
    DAILY_ALREADY_ATTEMPTED: 'dailyAlreadyAttempted',
    DAILY_UPDATE_CELLS: 'dailyUpdateCells',
    DAILY_BOARD_UPDATE: 'dailyBoardUpdate',
    DAILY_GAME_OVER: 'dailyGameOver',
    DAILY_WON: 'dailyWon',
    DAILY_SCORE_SUBMITTED: 'dailyScoreSubmitted',
    DAILY_LEADERBOARD_UPDATE: 'dailyLeaderboardUpdate',
});

module.exports = { CLIENT_EVENTS, SERVER_EVENTS };
