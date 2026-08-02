/**
 * Literal types for the event names in `shared/events.js`.
 *
 * The names live in the .js file, because the server requires it at runtime.
 * TypeScript infers `string` for those values, which is too wide to be useful:
 * `{ [SERVER_EVENTS.BOARD_UPDATE]: handler }` becomes a plain string key, so the
 * handler's payload can't be looked up in `ServerToClientEvents` and silently
 * falls back to `any`. Declaring the literal types here is what makes the
 * handler table in `hooks/useGameEvents.ts` type-checked at all.
 *
 * This is the one place in `shared/` where a name is written twice. That is a
 * drift risk, so `server/tests/events.test.js` asserts this file and
 * `shared/events.js` declare exactly the same keys and values — add an event to
 * one without the other and the suite fails.
 */

import type { ClientToServerEvents, ServerToClientEvents } from './socketPayloads';

export declare const CLIENT_EVENTS: {
    readonly CREATE_ROOM: 'createRoom';
    readonly JOIN_ROOM: 'joinRoom';
    readonly OPEN_CELL: 'openCell';
    readonly CHORD_CELL: 'chordCell';
    readonly TOGGLE_FLAG: 'toggleFlag';
    readonly EMIT_CONFETTI: 'emitConfetti';
    readonly CELL_HOVER: 'cellHover';
    readonly RESET_GAME: 'resetGame';
    readonly START_PVP_GAME: 'startPvpGame';
    readonly RESET_MY_BOARD: 'resetMyBoard';
    readonly PVP_REMATCH: 'pvpRematch';
    readonly PLAYER_LEAVE: 'playerLeave';
    readonly START_DAILY: 'startDaily';
    readonly DAILY_OPEN_CELL: 'dailyOpenCell';
    readonly DAILY_CHORD_CELL: 'dailyChordCell';
    readonly DAILY_TOGGLE_FLAG: 'dailyToggleFlag';
    readonly SUBMIT_DAILY_SCORE: 'submitDailyScore';
    readonly GET_DAILY_LEADERBOARD: 'getDailyLeaderboard';
};

export declare const SERVER_EVENTS: {
    readonly JOIN_ROOM_SUCCESS: 'joinRoomSuccess';
    readonly JOIN_ROOM_ERROR: 'joinRoomError';
    readonly CREATE_ROOM_ERROR: 'createRoomError';
    readonly ROOM_DOES_NOT_EXIST_ERROR: 'roomDoesNotExistError';
    readonly BOARD_UPDATE: 'boardUpdate';
    readonly UPDATE_CELLS: 'updateCells';
    readonly PLAYER_STATS_UPDATE: 'playerStatsUpdate';
    readonly GAME_WON: 'gameWon';
    readonly GAME_OVER: 'gameOver';
    readonly RESET_EVERYONE: 'resetEveryone';
    readonly RECEIVE_CONFETTI: 'receiveConfetti';
    readonly PLAYER_HOVER_UPDATE: 'playerHoverUpdate';
    readonly GAME_CLOCK: 'gameClock';
    readonly SESSION_RESUME: 'sessionResume';
    readonly PLAYER_LEFT: 'playerLeft';
    readonly PVP_ROOM_FULL: 'pvpRoomFull';
    readonly PVP_ROOM_READY: 'pvpRoomReady';
    readonly PVP_GAME_STARTED: 'pvpGameStarted';
    readonly PVP_BOARD_UPDATE: 'pvpBoardUpdate';
    readonly PVP_UPDATE_CELLS: 'pvpUpdateCells';
    readonly PVP_GAME_OVER: 'pvpGameOver';
    readonly PVP_OPPONENT_FAILED: 'pvpOpponentFailed';
    readonly PVP_OPPONENT_RESET: 'pvpOpponentReset';
    readonly PVP_PLAYER_WON: 'pvpPlayerWon';
    readonly PVP_OPPONENT_PROGRESS: 'pvpOpponentProgress';
    readonly PVP_OPPONENT_DISCONNECTED: 'pvpOpponentDisconnected';
    readonly PVP_OPPONENT_LEFT_BEFORE_START: 'pvpOpponentLeftBeforeStart';
    readonly PVP_HOST_TRANSFERRED: 'pvpHostTransferred';
    readonly PVP_REMATCH_STARTED: 'pvpRematchStarted';
    readonly DAILY_STARTED: 'dailyStarted';
    readonly DAILY_ALREADY_ATTEMPTED: 'dailyAlreadyAttempted';
    readonly DAILY_UPDATE_CELLS: 'dailyUpdateCells';
    readonly DAILY_BOARD_UPDATE: 'dailyBoardUpdate';
    readonly DAILY_GAME_OVER: 'dailyGameOver';
    readonly DAILY_WON: 'dailyWon';
    readonly DAILY_SCORE_SUBMITTED: 'dailyScoreSubmitted';
    readonly DAILY_LEADERBOARD_UPDATE: 'dailyLeaderboardUpdate';
};

/**
 * Every declared name must be one the protocol has a payload for. These two
 * lines are the check: if a name above is missing from socketPayloads.ts, or
 * spelled differently, this file stops compiling.
 */
type _ClientNamesAreCovered = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS] extends keyof ClientToServerEvents ? true : never;
type _ServerNamesAreCovered = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS] extends keyof ServerToClientEvents ? true : never;
export type _ProtocolCoverage = [_ClientNamesAreCovered, _ServerNamesAreCovered];
