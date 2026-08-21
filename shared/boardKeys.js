/**
 * How a board record is IDENTIFIED — the one copy, read by both halves.
 *
 * Imported by the client via `@/shared/boardKeys` and by the server via
 * `require('../shared/boardKeys')`, like `boardConfig` and `events`. It lived in
 * `lib/bestTimes.ts` while records were a browser-only thing; the server now
 * writes `user_board_bests` from its own clock, and a key spelled one way on
 * each side is a record written where nothing will ever look for it.
 *
 * ## A record is a board AND the size of the group that cleared it
 *
 * Boards are keyed by DIMENSIONS AND MINE COUNT, never the size/difficulty
 * labels: `setDimensions` gives a joiner the room's numbers and leaves their
 * labels alone, so keying on a label files their win under a board they never
 * played (CLAUDE.md trap #10).
 *
 * The player count is part of that identity rather than a note attached to it.
 * Two people splitting a board finish it faster than one person can, more or
 * less by construction — so with one slot per board the group time takes it and
 * holds it, and every solo run afterwards silently fails to be a record.
 *
 * Solo keeps the bare board string, so every record set before player counts
 * were part of the key is still found where it was left; only group clears take
 * the suffix.
 */

/**
 * Separates the board from the size of the group that cleared it. Never appears
 * in the board part, which is only digits, `x` and `/`.
 */
const PLAYERS_SEPARATOR = '@';

/**
 * A well-formed key, bounded for use as untrusted input (`validation.js`). The
 * suffix is optional because solo records do not carry one.
 */
const BOARD_KEY_PATTERN = /^\d{1,3}x\d{1,3}\/\d{1,4}(@\d{1,3})?$/;

/** The board part of a key: everything before the player-count suffix. */
const boardPartOf = (key) => String(key).split(PLAYERS_SEPARATOR)[0];

/** A board part, plus the group suffix a group clear takes. */
const withPlayers = (boardPart, players) =>
    players > 1 ? `${boardPart}${PLAYERS_SEPARATOR}${players}` : boardPart;

/**
 * Identifies a RESULT: which board, and how many people cleared it.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {number} mines
 * @param {number} [players]
 * @returns {string}
 */
const boardKey = (rows, cols, mines, players = 1) =>
    withPlayers(`${rows}x${cols}/${mines}`, players);

/**
 * How many players a clear counts as.
 *
 * A PVP race is SOLO work: you clear the whole board yourself and your opponent
 * never touches it, even though both of you are in the room. Counting the room
 * files a race next to co-op clears that split the board between two people,
 * and captions it "with 2 players".
 *
 * Read and write both go through this, on both sides of the wire, which is the
 * point — a record filed under one count and looked up under another is simply
 * never found again.
 *
 * @param {string} mode  'co-op' | 'pvp' | 'daily'
 * @param {number} playersInRoom
 * @returns {number}
 */
const playersForClear = (mode, playersInRoom) =>
    mode === 'pvp' ? 1 : Math.max(1, playersInRoom);

module.exports = {
    PLAYERS_SEPARATOR,
    BOARD_KEY_PATTERN,
    boardPartOf,
    withPlayers,
    boardKey,
    playersForClear,
};
