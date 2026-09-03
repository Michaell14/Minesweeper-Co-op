/**
 * Socket payload validation. Pure — no io, no Redis — so it is cheap to test and
 * safe to call from anywhere. Add new rules here rather than inline in a handler.
 *
 * The limits below are duplicated on the client with DIFFERENT values; unifying
 * them is a separate change (see ARCHITECTURE.md §8).
 */

// Re-exported below: the board rule lives in shared/ so the client checks the same thing.
const { isValidBoardConfig } = require('../shared/boardConfig');
const { AVATAR_IDS } = require('../shared/avatars');
const { BOARD_KEY_PATTERN } = require('../shared/boardKeys');
const { EMOTE_IDS } = require('../shared/emotes');

const MAX_ROOM_CODE_LENGTH = 100;
const MAX_PLAYER_NAME_LENGTH = 50;
const MAX_DAILY_TOKEN_LENGTH = 100;
const MAX_SESSION_ID_LENGTH = 100;

/** Upper bound on a cell coordinate, independent of the room's real dimensions. */
const MAX_COORDINATE = 100;

/** Sentinel row/col meaning "this player is no longer hovering any cell". */
const NO_HOVER = -1;

const isValidRoomCode = (room) =>
    typeof room === 'string' && room.length > 0 && room.length <= MAX_ROOM_CODE_LENGTH;

const isValidPlayerName = (name) =>
    typeof name === 'string' && name.length > 0 && name.length <= MAX_PLAYER_NAME_LENGTH;

/**
 * A name as STORED, trimmed. Validate the RESULT wherever a name is persisted:
 * a raw '   ' passes the length check and lands on the leaderboard as a blank row.
 */
const normalizePlayerName = (name) => (typeof name === 'string' ? name.trim() : '');

const isValidMode = (mode) => mode === 'co-op' || mode === 'pvp';

/** An avatar as STORED: one id from the shared catalog, nothing free-form. */
const isValidAvatarId = (avatar) => AVATAR_IDS.includes(avatar);

/**
 * An emote as SENT: one id from the shared catalog. The closed vocabulary is
 * what means nothing a player sends another needs moderating.
 */
const isValidEmoteId = (emote) => EMOTE_IDS.includes(emote);

/**
 * Shape-checked before Postgres: `users.id` is a uuid column, so a malformed
 * one would be a driver type error that reads as a 503.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUserId = (id) => typeof id === 'string' && UUID_RE.test(id);

/** Opaque client-generated id for a daily attempt -- same shape as a room code. */
const isValidDailyToken = (token) =>
    typeof token === 'string' && token.length > 0 && token.length <= MAX_DAILY_TOKEN_LENGTH;

/**
 * The handshake's client-minted session id. Bounded because it builds a Redis
 * key; anything failing this is treated as no session, a supported state.
 */
const isValidSessionId = (id) =>
    typeof id === 'string' && id.length > 0 && id.length <= MAX_SESSION_ID_LENGTH;

/** Room-friends request counter, echoed back untouched. An ordering handle, never an address. */
const isValidRequestToken = (token) => Number.isSafeInteger(token) && token >= 0;

/** YYYY-MM-DD (UTC). Only addresses state; a malformed date just finds no attempt. */
const isValidDailyDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);

/** Cell coordinates for openCell / chordCell / toggleFlag. */
const isValidCoordinate = (row, col) => {
    if (typeof row !== 'number' || typeof col !== 'number') return false;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    return row >= 0 && row <= MAX_COORDINATE && col >= 0 && col <= MAX_COORDINATE;
};

/**
 * Hover coordinates, plus the "no hover" sentinel, which is the PAIR (-1, -1)
 * only: the client clears only on that pair, so a half-sentinel like (-1, 5000)
 * was once stored and drawn off-board where no later hover could remove it.
 */
const isValidHoverCoordinate = (row, col) => {
    if (typeof row !== 'number' || typeof col !== 'number') return false;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    if (row === NO_HOVER && col === NO_HOVER) return true;
    return row >= 0 && row <= MAX_COORDINATE && col >= 0 && col <= MAX_COORDINATE;
};

/**
 * Whether a coordinate lands on THIS room's board. `isValidCoordinate` bounds
 * globally, before any room is loaded; a cell action then indexes the stored
 * board and finds nothing, but a ping is broadcast raw. Dimensions come back
 * from Redis as strings.
 */
const isCoordinateOnBoard = (roomState, row, col) => {
    const numRows = parseInt(roomState?.numRows, 10);
    const numCols = parseInt(roomState?.numCols, 10);
    if (!Number.isInteger(numRows) || !Number.isInteger(numCols)) return false;
    return row >= 0 && row < numRows && col >= 0 && col < numCols;
};

/** Whether a socket id is in a room hash's players list. Tolerates a missing or malformed field. */
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

/**
 * Generous cap so an account cannot be used as object storage. Shape is the
 * client's job (lib/settings.ts); the server stores the blob without reading it.
 */
const MAX_SETTINGS_BLOB_BYTES = 8192;

/** The settings blob: a plain object of tolerable size. Nothing deeper. */
const isValidSettingsBlob = (blob) => {
    if (typeof blob !== 'object' || blob === null || Array.isArray(blob)) return false;
    try {
        return JSON.stringify(blob).length <= MAX_SETTINGS_BLOB_BYTES;
    } catch {
        return false; // circular or otherwise unserialisable
    }
};

/** Client-minted theme slug: what lib/customThemes.ts mints, nothing wilder. */
const isValidThemeId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(id);

/**
 * The client owns the schema (lib/customThemes.ts re-derives the palette on
 * read), so the server checks only what abuse looks like: shape and size.
 */
const MAX_THEME_BLOB_BYTES = 16384;
const isValidThemeBlob = (blob) => {
    if (typeof blob !== 'object' || blob === null || Array.isArray(blob)) return false;
    if (!isValidThemeId(blob.id)) return false;
    if (typeof blob.name !== 'string' || blob.name.trim() === '' || blob.name.length > 24) return false;
    if (typeof blob.core !== 'object' || blob.core === null) return false;
    if (typeof blob.palette !== 'object' || blob.palette === null) return false;
    try {
        return JSON.stringify(blob).length <= MAX_THEME_BLOB_BYTES;
    } catch {
        return false;
    }
};

/**
 * `rows x cols / mines`, optionally `@players` (shared/boardKeys.js). The suffix
 * is a GROUP clear; rejecting it once 400'd the whole guest import under `every`.
 */
const isValidBoardKey = (key) => typeof key === 'string' && BOARD_KEY_PATTERN.test(key);

/**
 * Guest best-times import. Bounded and shape-checked here; statsRepo's
 * keep-if-faster upsert makes the numbers harmless.
 */
const MAX_BEST_IMPORT_ENTRIES = 100;
const isValidBestImport = (bests) =>
    Array.isArray(bests) &&
    bests.length <= MAX_BEST_IMPORT_ENTRIES &&
    bests.every(
        (best) =>
            typeof best === 'object' &&
            best !== null &&
            isValidBoardKey(best.boardKey) &&
            typeof best.seconds === 'number' &&
            Number.isFinite(best.seconds) &&
            best.seconds >= 0 &&
            best.seconds <= 86400 &&
            Number.isInteger(best.players) &&
            best.players >= 1 &&
            best.players <= 100 &&
            typeof best.achievedAt === 'number' &&
            Number.isFinite(best.achievedAt),
    );

module.exports = {
    isValidRoomCode,
    isValidPlayerName,
    normalizePlayerName,
    isValidMode,
    isValidAvatarId,
    isValidEmoteId,
    isValidUserId,
    isValidRequestToken,
    isValidBoardConfig,
    isValidCoordinate,
    isValidHoverCoordinate,
    isCoordinateOnBoard,
    isPlayerInRoom,
    isValidDailyToken,
    isValidSessionId,
    isValidDailyDate,
    isValidSettingsBlob,
    isValidThemeId,
    isValidThemeBlob,
    isValidBoardKey,
    isValidBestImport,
};
