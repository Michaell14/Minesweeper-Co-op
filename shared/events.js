/**
 * The socket protocol's event names — the one copy.
 *
 * Imported by BOTH halves: the client via `@/shared/events`, the server via
 * `require('../shared/events')`. CommonJS so it works untouched from the CJS
 * server and from the bundler. Viable only because the whole repo deploys, the
 * same as shared/boardConfig — see ARCHITECTURE.md §6.
 *
 * These were string literals typed out in both halves, so a typo produced an
 * event nobody listened to and no error anywhere. `server/tests/events.test.js`
 * enforces that the server's source uses these constants rather than literals.
 *
 * Payload shapes live in `shared/socketPayloads.ts`, and `shared/events.d.ts`
 * gives these names literal types so the client can look a payload up by event.
 * Both are TypeScript, so they bind the client only — this file stays plain JS
 * because the server requires it at runtime.
 */

/** Client -> server. Every one is a `socket.on` handler in server/server.js. */
const CLIENT_EVENTS = {
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
};

/** Server -> client. Every one has a handler in hooks/useGameEvents.ts. */
const SERVER_EVENTS = {
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
};

module.exports = { CLIENT_EVENTS, SERVER_EVENTS };
