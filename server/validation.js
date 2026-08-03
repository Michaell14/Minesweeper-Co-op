/**
 * Socket payload validation. Pure — no io, no Redis — so it is cheap to test and
 * safe to call from anywhere. Add new rules here rather than inline in a handler.
 *
 * The limits below are duplicated on the client with DIFFERENT values; unifying
 * them is a separate change (see ARCHITECTURE.md §8).
 */

// Re-exported below: the board rule lives in shared/ so the client checks the
// same thing before it ever emits.
const { isValidBoardConfig } = require('../shared/boardConfig');

const MAX_ROOM_CODE_LENGTH = 100;
const MAX_PLAYER_NAME_LENGTH = 50;
const MAX_DAILY_TOKEN_LENGTH = 100;

/** Upper bound on a cell coordinate, independent of the room's real dimensions. */
const MAX_COORDINATE = 100;

/** Sentinel row/col meaning "this player is no longer hovering any cell". */
const NO_HOVER = -1;

const isValidRoomCode = (room) =>
    typeof room === 'string' && room.length > 0 && room.length <= MAX_ROOM_CODE_LENGTH;

const isValidPlayerName = (name) =>
    typeof name === 'string' && name.length > 0 && name.length <= MAX_PLAYER_NAME_LENGTH;

/**
 * A name as it will be STORED -- surrounding whitespace is not part of it.
 *
 * Validate the RESULT of this, not the raw input, wherever a name is persisted
 * somewhere durable and public. The browser trims before it emits, but anything
 * speaking the protocol directly can send '   ' — which clears the length check
 * above and lands on the leaderboard as a row with no name in it.
 */
const normalizePlayerName = (name) => (typeof name === 'string' ? name.trim() : '');

const isValidMode = (mode) => mode === 'co-op' || mode === 'pvp';

/** Opaque client-generated id for a daily attempt -- same shape as a room code. */
const isValidDailyToken = (token) =>
    typeof token === 'string' && token.length > 0 && token.length <= MAX_DAILY_TOKEN_LENGTH;

/** The server's own YYYY-MM-DD (UTC) -- never trusted to gate state, only to
 * address it; a malformed date just fails to find any matching attempt. */
const isValidDailyDate = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);

/** Cell coordinates for openCell / chordCell / toggleFlag. */
const isValidCoordinate = (row, col) => {
    if (typeof row !== 'number' || typeof col !== 'number') return false;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    return row >= 0 && row <= MAX_COORDINATE && col >= 0 && col <= MAX_COORDINATE;
};

/**
 * Hover coordinates, which additionally allow the "no hover" sentinel.
 *
 * The sentinel is the PAIR (-1, -1), and nothing else. This used to skip the
 * bounds check whenever either coordinate was -1, on the reasoning that the
 * client reads any -1 as "clear the hover" — but it does not: it clears only on
 * (-1, -1), so a half-sentinel like (-1, 5000) was stored and drawn as a remote
 * cursor at a position off the board, which no later hover could ever move or
 * remove.
 */
const isValidHoverCoordinate = (row, col) => {
    if (typeof row !== 'number' || typeof col !== 'number') return false;
    if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
    if (row === NO_HOVER && col === NO_HOVER) return true;
    return row >= 0 && row <= MAX_COORDINATE && col >= 0 && col <= MAX_COORDINATE;
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

/**
 * Generous: today's blob is under 100 bytes, and every PRD phase adds keys.
 * The cap exists so an account cannot be used as free object storage, not to
 * police the shape — the client owns that (lib/settings.ts sanitises both
 * directions), and this server stores the blob whole without reading it.
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
 * A custom-theme blob. Like the settings blob the client owns the real schema
 * (lib/customThemes.ts sanitises and RE-DERIVES the palette on read), so the
 * server checks only what abuse looks like: shape, key shapes, and size.
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

/** `rows x cols / mines` — lib/bestTimes.ts's boardKey shape, bounded sanely. */
const isValidBoardKey = (key) =>
    typeof key === 'string' && /^\d{1,3}x\d{1,3}\/\d{1,4}$/.test(key);

/**
 * The guest best-times import: an array of client-reported records. Bounded
 * and shape-checked here; statsRepo's keep-if-faster upsert is what makes the
 * numbers harmless — an import can only improve a PRIVATE profile.
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
    isValidBoardConfig,
    isValidCoordinate,
    isValidHoverCoordinate,
    isPlayerInRoom,
    isValidDailyToken,
    isValidDailyDate,
    isValidSettingsBlob,
    isValidThemeId,
    isValidThemeBlob,
    isValidBoardKey,
    isValidBestImport,
};
