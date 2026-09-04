/**
 * The socket protocol's event names, the one copy, imported by BOTH halves
 * (CommonJS so the server can require it at runtime). Payload shapes live in
 * shared/socketPayloads.ts and bind the client only; server/tests/events.test.js
 * enforces that the server uses these constants rather than literals.
 * `Object.freeze` is load-bearing: TypeScript then infers the literal
 * 'boardUpdate' instead of `string`, which is what types the handler table in
 * useGameEvents.ts without a hand-written events.d.ts.
 */

/** Client -> server. Every one is a row in server/routes/index.js. */
const CLIENT_EVENTS = Object.freeze({
    CREATE_ROOM: 'createRoom',
    JOIN_ROOM: 'joinRoom',
    OPEN_CELL: 'openCell',
    CHORD_CELL: 'chordCell',
    TOGGLE_FLAG: 'toggleFlag',
    EMIT_CONFETTI: 'emitConfetti',
    SEND_EMOTE: 'sendEmote',
    PING_CELL: 'pingCell',
    INVITE_FRIEND: 'inviteFriend',
    ROOM_FRIENDS: 'roomFriends',
    ADD_ROOM_FRIEND: 'addRoomFriend',
    CELL_HOVER: 'cellHover',
    RESET_GAME: 'resetGame',
    START_PVP_GAME: 'startPvpGame',
    RESET_MY_BOARD: 'resetMyBoard',
    PVP_REMATCH: 'pvpRematch',
    PLAYER_LEAVE: 'playerLeave',

    // Matchmaking -- pre-room, so none of these carries a room code.
    FIND_MATCH: 'findMatch',
    CANCEL_MATCH: 'cancelMatch',
    START_PRACTICE_RACE: 'startPracticeRace',

    // Daily challenge: NOT room-scoped, addressed by date + attempt token (server/data/keys.js).
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
    PLAYER_EMOTE: 'playerEmote',
    PLAYER_PING: 'playerPing',

    // Friends. Not room-scoped: presence and invites are about the account, not the game.
    FRIENDS_ONLINE: 'friendsOnline',
    FRIEND_PRESENCE: 'friendPresence',
    FRIEND_INVITE: 'friendInvite',
    ROOM_FRIENDS_UPDATE: 'roomFriendsUpdate',
    PLAYER_HOVER_UPDATE: 'playerHoverUpdate',
    GAME_CLOCK: 'gameClock',
    SESSION_RESUME: 'sessionResume',
    PLAYER_LEFT: 'playerLeft',

    // Achievements: sent to ONE socket, only when a result unlocked something; any mode, daily included.
    ACHIEVEMENTS_UNLOCKED: 'achievementsUnlocked',

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

    // Matchmaking. A found match arrives as an ordinary joinRoomSuccess + pvpRoomReady.
    MATCH_SEARCHING: 'matchSearching',
    MATCH_ONLINE_COUNT: 'matchOnlineCount',
    MATCH_CANCELLED: 'matchCancelled',
    MATCH_ERROR: 'matchError',

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
