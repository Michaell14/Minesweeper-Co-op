/**
 * Socket payload validation.
 *
 * These rules used to be copy-pasted inline in five server.js handlers, which
 * meant a new event only got validated if whoever added it noticed the pattern
 * and replicated it correctly. Everything here is pure — no io, no Redis — so
 * it is cheap to test and safe to call from anywhere.
 *
 * The limits below are the ones server.js already enforced; they are duplicated
 * on the client in components/Landing.tsx with DIFFERENT values. Unifying those
 * is a separate change (see ARCHITECTURE.md §8).
 */

const { isValidBoardConfig } = require('../shared/boardConfig');

const MAX_ROOM_CODE_LENGTH = 100;
const MAX_PLAYER_NAME_LENGTH = 50;
const MAX_DAILY_TOKEN_LENGTH = 100;

/** Upper bound on a cell coordinate, independent of the room's real dimensions. */
const MAX_COORDINATE = 100;

/** Sentinel row/col meaning "this player is no longer hovering any cell". */
const NO_HOVER = -1;

/**
 * INTENTIONAL DIVERGENCE: createRoom/joinRoom already applied the length cap,
 * but the game-action handlers only checked `typeof room === 'string'`. They now
 * share this stricter check. No functional change -- a room code longer than the
 * cap can never have been created, so those actions failed at the room lookup a
 * moment later anyway.
 */
const isValidRoomCode = (room) =>
    typeof room === 'string' && room.length > 0 && room.length <= MAX_ROOM_CODE_LENGTH;

const isValidPlayerName = (name) =>
    typeof name === 'string' && name.length > 0 && name.length <= MAX_PLAYER_NAME_LENGTH;

const isValidMode = (mode) => mode === 'co-op' || mode === 'pvp';

/** Opaque client-generated id for a daily attempt -- same shape as a room code. */
const isValidDailyToken = (token) =>
    typeof token === 'string' && token.length > 0 && token.length <= MAX_DAILY_TOKEN_LENGTH;

/** The server's own YYYY-MM-DD (UTC) -- never trusted to gate state, only to
 * address it; a malformed date just fails to find any matching attempt. */
const isValidDailyDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);

/**
 * Board dimensions and mine count. The rule itself lives in
 * shared/boardConfig.js so the client checks the same thing before it ever
 * emits; this is only the socket-layer entry point.
 *
 * NOTE ON NaN: the rule asks "is this VALID?" with `<` rather than "is this
 * invalid?" with `>=`. Every comparison against NaN is false, so the `>=` form
 * used to let a NaN dimension through and create a zero-length board.
 */

/** Cell coordinates for openCell / chordCell / toggleFlag. */
const isValidCoordinate = (row, col) => {
    if (typeof row !== 'number' || typeof col !== 'number') return false;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    return row >= 0 && row <= MAX_COORDINATE && col >= 0 && col <= MAX_COORDINATE;
};

/**
 * Hover coordinates, which additionally allow the "no hover" sentinel.
 *
 * QUIRK, PRESERVED VERBATIM: the original bounds check was skipped whenever
 * EITHER coordinate was -1, not only for the (-1, -1) pair. So (-1, 500) is
 * accepted here, exactly as it was before. Downstream this is harmless — the
 * client treats any -1 as "clear the hover" — but tightening it would be a
 * behavior change, so it is left alone and covered by a test.
 */
const isValidHoverCoordinate = (row, col) => {
    if (typeof row !== 'number' || typeof col !== 'number') return false;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    if (row !== NO_HOVER && col !== NO_HOVER) {
        return row >= 0 && row <= MAX_COORDINATE && col >= 0 && col <= MAX_COORDINATE;
    }
    return true;
};

/**
 * Whether a socket id appears in a room hash's players list.
 * Tolerates a missing or malformed players field rather than throwing.
 */
const isPlayerInRoom = (roomState, socketId) => {
    if (!roomState) return false;
    let players;
    try {
        players = JSON.parse(roomState.players || '[]');
    } catch {
        return false;
    }
    return Array.isArray(players) && players.includes(socketId);
};

module.exports = {
    isValidRoomCode,
    isValidPlayerName,
    isValidMode,
    isValidBoardConfig,
    isValidCoordinate,
    isValidHoverCoordinate,
    isPlayerInRoom,
    isValidDailyToken,
    isValidDailyDate,
};
