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

const MAX_ROOM_CODE_LENGTH = 100;
const MAX_PLAYER_NAME_LENGTH = 50;

const MIN_ROWS = 8;
const MAX_ROWS = 32;
const MIN_COLS = 8;
const MAX_COLS = 16;

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

/**
 * Board dimensions and mine count. Mines must stay under half the board so the
 * generator always has room to place them outside the first-click safe zone.
 *
 * INTENTIONAL DIVERGENCE from the inline version this replaces: the old code
 * asked "is this INVALID?" via `numMines >= (numRows * numCols) / 2`, and every
 * comparison against NaN is false, so a NaN dimension slipped through and
 * produced a room with a zero-length board. Asking "is this VALID?" with `<`
 * rejects NaN instead. Unreachable over socket.io in any case, since its JSON
 * encoding turns NaN into null, which both versions reject.
 */
const isValidBoardConfig = (numRows, numCols, numMines) => {
    if (typeof numRows !== 'number' || numRows < MIN_ROWS || numRows > MAX_ROWS) return false;
    if (typeof numCols !== 'number' || numCols < MIN_COLS || numCols > MAX_COLS) return false;
    if (typeof numMines !== 'number' || numMines < 1) return false;
    return numMines < (numRows * numCols) / 2;
};

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
    MAX_ROOM_CODE_LENGTH,
    MAX_PLAYER_NAME_LENGTH,
    MIN_ROWS,
    MAX_ROWS,
    MIN_COLS,
    MAX_COLS,
    MAX_COORDINATE,
    NO_HOVER,
    isValidRoomCode,
    isValidPlayerName,
    isValidMode,
    isValidBoardConfig,
    isValidCoordinate,
    isValidHoverCoordinate,
    isPlayerInRoom,
};
