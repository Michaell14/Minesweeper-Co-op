/**
 * How a board record is IDENTIFIED, read by both halves like `boardConfig` and
 * `events`; a key spelled differently per side is a record nothing will find.
 *
 * Boards are keyed by DIMENSIONS AND MINE COUNT, never size/difficulty labels:
 * `setDimensions` gives a joiner the room's numbers and leaves their labels
 * alone (CLAUDE.md trap #10). The player count is part of the identity: a
 * group finishes faster than one person can, so with one slot per board no
 * solo run would ever be a record again. Solo keeps the bare board string, so
 * records set before player counts existed are still found.
 */

/**
 * Separates the board from the group size. Never appears in the board part
 * (digits, `x` and `/` only). Module-private: keys go through the helpers below.
 */
const PLAYERS_SEPARATOR = '@';

/** A well-formed key, bounded for untrusted input (`validation.js`). Solo records carry no suffix. */
const BOARD_KEY_PATTERN = /^\d{1,3}x\d{1,3}\/\d{1,4}(@\d{1,3})?$/;

/** The board part of a key: everything before the player-count suffix. */
const boardPartOf = (key) => String(key).split(PLAYERS_SEPARATOR)[0];

/** A board part, plus the group suffix a group clear takes. */
const withPlayers = (boardPart, players) =>
    players > 1 ? `${boardPart}${PLAYERS_SEPARATOR}${players}` : boardPart;

/**
 * Identifies a RESULT: which board, and how many cleared it.
 * @param {number} rows
 * @param {number} cols
 * @param {number} mines
 * @param {number} [players]
 * @returns {string}
 */
const boardKey = (rows, cols, mines, players = 1) =>
    withPlayers(`${rows}x${cols}/${mines}`, players);

/**
 * The count back out of the key `boardKey` put in; no suffix means 1. Derive
 * it from the key rather than recomputing beside it, so key and count cannot disagree.
 * @param {string} key
 * @returns {number}
 */
const playersFromKey = (key) => {
    const suffix = String(key).split(PLAYERS_SEPARATOR)[1];
    const players = parseInt(suffix, 10);
    return Number.isInteger(players) && players > 1 ? players : 1;
};

/**
 * How many players a clear counts as. A PVP race is SOLO work: you clear the
 * whole board yourself. Read and write both go through this on both sides, or
 * a record filed under one count is never found under another.
 * @param {string} mode  'co-op' | 'pvp' | 'daily'
 * @param {number} playersInRoom
 * @returns {number}
 */
const playersForClear = (mode, playersInRoom) =>
    mode === 'pvp' ? 1 : Math.max(1, playersInRoom);

module.exports = {
    BOARD_KEY_PATTERN,
    boardPartOf,
    withPlayers,
    boardKey,
    playersFromKey,
    playersForClear,
};
