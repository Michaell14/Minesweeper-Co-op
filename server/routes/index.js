/**
 * The server's half of the socket protocol, as data: one row per client event.
 *
 *   event      the name, always from shared/events.js
 *   rateLimit  optional; a bucket key and its refill, applied FIRST
 *   validate   optional; a pure payload predicate. Refusal is SILENT
 *   guard      required; see routes/guards.js
 *   handler    ({ socket, io, payload, roomState }) => Promise
 *
 * routes/register.js applies them in that order. `createRoom`, `joinRoom` and
 * the matchmaking routes declare no `validate` because they owe a refused
 * client a specific error, so their checks stay beside the emit. `disconnect`
 * is socket.io's own event and stays in server.js.
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
    isValidUserId,
    isValidRequestToken,
    isValidDailyToken,
    isValidDailyDate,
} = require('../validation');
const { GUARDS } = require('./guards');
const { registerRoutes } = require('./register');

const room = require('./room');
const cells = require('./cells');
const social = require('./social');
const friends = require('./friends');
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
     * All three fan out to the room and take the SILENT guard: an error would
     * hand a flooder an amplifier, and eviction would end a game over a
     * cosmetic message. Emote and ping share ONE bucket, keyed by category so
     * a third expressive message cannot widen the limit (domain/rateLimit.js).
     */
    {
        event: CLIENT_EVENTS.SEND_EMOTE,
        rateLimit: { key: 'expressionBucket', burst: EXPRESSION_BURST, perSecond: EXPRESSION_PER_SECOND },
        validate: ({ room: code, emote }) => isValidRoomCode(code) && isValidEmoteId(emote),
        guard: GUARDS.ROOM_MEMBER_SILENT,
        handler: social.emote,
    },
    {
        event: CLIENT_EVENTS.PING_CELL,
        // Same bucket as sendEmote, or alternating the two doubles the rate.
        rateLimit: { key: 'expressionBucket', burst: EXPRESSION_BURST, perSecond: EXPRESSION_PER_SECOND },
        // A real cell, unlike hover; the handler bounds it against the room's board.
        validate: roomAndCell,
        guard: GUARDS.ROOM_MEMBER_SILENT,
        handler: social.ping,
    },
    {
        event: CLIENT_EVENTS.CELL_HOVER,
        rateLimit: { key: 'hoverBucket', burst: HOVER_BURST, perSecond: HOVER_PER_SECOND },
        // row/col of -1 means "no hover", which isValidCoordinate refuses.
        validate: ({ room: code, row, col }) => isValidRoomCode(code) && isValidHoverCoordinate(row, col),
        guard: GUARDS.ROOM_MEMBER_SILENT,
        handler: social.hover,
    },

    /*
     * --- Friends, in a room: silent, and never rate-limited here ---
     * The graph's own surface is REST. These take the SILENT guard so a
     * refusal is not distinguishable from "they blocked you" (routes/friends.js).
     * No bucket: an invite is bounded by its own per-pair cooldown.
     */
    {
        event: CLIENT_EVENTS.INVITE_FRIEND,
        validate: ({ room: code, friendId }) => isValidRoomCode(code) && isValidUserId(friendId),
        guard: GUARDS.ROOM_MEMBER_SILENT,
        handler: friends.invite,
    },
    {
        event: CLIENT_EVENTS.ROOM_FRIENDS,
        validate: ({ room: code, token }) => isValidRoomCode(code) && isValidRequestToken(token),
        guard: GUARDS.ROOM_MEMBER_SILENT,
        handler: friends.list,
    },
    {
        event: CLIENT_EVENTS.ADD_ROOM_FRIEND,
        validate: ({ room: code, playerId, token }) =>
            isValidRoomCode(code) && isValidRequestToken(token) && typeof playerId === 'string' && playerId.length > 0,
        guard: GUARDS.ROOM_MEMBER_SILENT,
        handler: friends.add,
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
