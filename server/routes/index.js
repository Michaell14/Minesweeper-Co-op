/**
 * The server's half of the socket protocol, as data.
 *
 * One row per client event. Reading down the table answers "what does this
 * server listen for, what shape must it be in, and who is allowed to send it?"
 * without reading a handler — which is what `server.js` used to require, across
 * 564 lines and twenty-two hand-written copies of the same four steps.
 *
 * A row is:
 *
 *   event      the name, always from shared/events.js — never a literal
 *   rateLimit  optional; a bucket key and its refill, applied FIRST
 *   validate   optional; a pure payload predicate. Refusal is SILENT
 *   guard      required; see routes/guards.js
 *   handler    ({ socket, io, payload, roomState }) => Promise
 *
 * The registrar applies them in that order, for every row (routes/register.js).
 *
 * Two rows deliberately declare no `validate`, and it is worth knowing why
 * rather than reading it as an oversight: `createRoom`, `joinRoom` and the
 * matchmaking routes owe a REFUSED client a specific error — `createRoomError`,
 * `joinRoomError`, `matchError` — and the registrar's refusal is silent. Those
 * checks stay in the handler, beside the emit that answers them.
 *
 * `disconnect` is not here: it is socket.io's own event rather than part of
 * this protocol, and stays wired in server.js with the rest of the connection
 * lifecycle.
 */

const { CLIENT_EVENTS } = require('../../shared/events');
const {
    HOVER_BURST,
    HOVER_PER_SECOND,
    EXPRESSION_BURST,
    EXPRESSION_PER_SECOND,
} = require('../domain/rateLimit');
const {
    isValidRoomCode,
    isValidCoordinate,
    isValidHoverCoordinate,
    isValidEmoteId,
    isValidDailyToken,
    isValidDailyDate,
} = require('../validation');
const { GUARDS } = require('./guards');
const { registerRoutes } = require('./register');

const room = require('./room');
const cells = require('./cells');
const social = require('./social');
const pvp = require('./pvp');
const daily = require('./daily');
const match = require('./match');

/** Room code plus an in-range cell — what every board action needs. */
const roomAndCell = ({ room: code, row, col }) => isValidRoomCode(code) && isValidCoordinate(row, col);

/** A daily action: a well-formed token, a date, and a cell. */
const dailyCell = ({ dailyAttemptToken, date, row, col }) =>
    isValidDailyToken(dailyAttemptToken) && isValidDailyDate(date) && isValidCoordinate(row, col);

const ROUTES = [
    // --- Room lifecycle: these answer their own refusals (see above) ---
    { event: CLIENT_EVENTS.CREATE_ROOM, guard: GUARDS.NONE, handler: room.create },
    { event: CLIENT_EVENTS.JOIN_ROOM, guard: GUARDS.NONE, handler: room.join },
    { event: CLIENT_EVENTS.PLAYER_LEAVE, guard: GUARDS.NONE, handler: room.leave },

    // --- Board actions: room member, or nothing happens ---
    {
        event: CLIENT_EVENTS.OPEN_CELL,
        validate: roomAndCell,
        guard: GUARDS.ROOM_MEMBER,
        handler: cells.open,
    },
    {
        event: CLIENT_EVENTS.CHORD_CELL,
        validate: roomAndCell,
        guard: GUARDS.ROOM_MEMBER,
        handler: cells.chord,
    },
    {
        event: CLIENT_EVENTS.TOGGLE_FLAG,
        validate: roomAndCell,
        guard: GUARDS.ROOM_MEMBER,
        handler: cells.flag,
    },
    {
        event: CLIENT_EVENTS.RESET_GAME,
        validate: ({ room: code }) => isValidRoomCode(code),
        guard: GUARDS.ROOM_MEMBER,
        handler: cells.reset,
    },
    {
        event: CLIENT_EVENTS.EMIT_CONFETTI,
        validate: ({ room: code }) => isValidRoomCode(code),
        guard: GUARDS.ROOM_MEMBER,
        handler: cells.confetti,
    },

    /*
     * --- Expression: rate-limited, and refused in silence ---
     *
     * The only two routes a client sends unprompted and that fan out to the
     * room. Both take the SILENT guard: answering a refused hover with an error
     * would hand a flooding client an amplifier, and evicting the sender would
     * end a live game over a cosmetic message.
     */
    {
        event: CLIENT_EVENTS.SEND_EMOTE,
        rateLimit: { key: 'expressionBucket', burst: EXPRESSION_BURST, perSecond: EXPRESSION_PER_SECOND },
        validate: ({ room: code, emote }) => isValidRoomCode(code) && isValidEmoteId(emote),
        guard: GUARDS.ROOM_MEMBER_SILENT,
        handler: social.emote,
    },
    {
        event: CLIENT_EVENTS.CELL_HOVER,
        rateLimit: { key: 'hoverBucket', burst: HOVER_BURST, perSecond: HOVER_PER_SECOND },
        // row/col of -1 means "no hover", which isValidCoordinate refuses.
        validate: ({ room: code, row, col }) => isValidRoomCode(code) && isValidHoverCoordinate(row, col),
        guard: GUARDS.ROOM_MEMBER_SILENT,
        handler: social.hover,
    },

    // --- PVP lifecycle ---
    {
        event: CLIENT_EVENTS.START_PVP_GAME,
        validate: ({ room: code }) => isValidRoomCode(code),
        guard: GUARDS.ROOM_MEMBER,
        handler: pvp.start,
    },
    {
        event: CLIENT_EVENTS.RESET_MY_BOARD,
        validate: ({ room: code }) => isValidRoomCode(code),
        guard: GUARDS.ROOM_MEMBER,
        handler: pvp.resetBoard,
    },
    {
        event: CLIENT_EVENTS.PVP_REMATCH,
        validate: ({ room: code }) => isValidRoomCode(code),
        guard: GUARDS.ROOM_MEMBER,
        handler: pvp.rematch,
    },

    // --- Matchmaking: pre-room, so no room code and no room guard ---
    { event: CLIENT_EVENTS.FIND_MATCH, guard: GUARDS.NONE, handler: match.find },
    { event: CLIENT_EVENTS.CANCEL_MATCH, guard: GUARDS.NONE, handler: match.cancel },
    { event: CLIENT_EVENTS.START_PRACTICE_RACE, guard: GUARDS.NONE, handler: match.practice },

    // --- Daily challenge: not a room, addressed by date + browser token ---
    { event: CLIENT_EVENTS.START_DAILY, guard: GUARDS.NONE, handler: daily.start },
    {
        event: CLIENT_EVENTS.DAILY_OPEN_CELL,
        validate: dailyCell,
        guard: GUARDS.NONE,
        handler: daily.open,
    },
    {
        event: CLIENT_EVENTS.DAILY_CHORD_CELL,
        validate: dailyCell,
        guard: GUARDS.NONE,
        handler: daily.chord,
    },
    {
        event: CLIENT_EVENTS.DAILY_TOGGLE_FLAG,
        validate: dailyCell,
        guard: GUARDS.NONE,
        handler: daily.flag,
    },
    {
        event: CLIENT_EVENTS.SUBMIT_DAILY_SCORE,
        validate: ({ dailyAttemptToken, date }) => isValidDailyToken(dailyAttemptToken) && isValidDailyDate(date),
        guard: GUARDS.NONE,
        handler: daily.submit,
    },
    {
        event: CLIENT_EVENTS.GET_DAILY_LEADERBOARD,
        validate: ({ date }) => isValidDailyDate(date),
        guard: GUARDS.NONE,
        handler: daily.leaderboard,
    },
];

/** Attaches every route to one socket. */
const register = (socket, io) => registerRoutes(ROUTES, { socket, io });

module.exports = { ROUTES, register };
