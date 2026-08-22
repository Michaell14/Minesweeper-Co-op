/**
 * Re-files user_board_bests under the key each row's own `players` implies.
 *
 * The table was keyed by board alone, with the player count as a column — so a
 * three-player co-op clear and a solo run competed for one row. Groups split
 * the board and finish faster more or less by construction, so the group time
 * took the slot and no solo run afterwards could ever be a record again. The
 * browser's copy has keyed on the count for a while (`shared/boardKeys.js`);
 * this brings the server's rows onto the same identity, which is what lets the
 * in-game banner read the account instead of localStorage.
 *
 * Nothing is invented: the count has been stored on every row all along, and
 * this is the same rule `byPlayerCount` applies to a browser's records on read.
 *
 * ONE thing it cannot recover: a PVP race recorded `players: 2` (the room)
 * before this change, and the table has no mode column to tell that from a
 * two-player co-op clear. Those rows move to '…@2' with the pairs. That is the
 * safe direction — an old race record may sit beside the solo slot instead of
 * being read as one, rather than a race's time being presented as your solo
 * best. New races file as solo, which is what they are.
 *
 * Collisions are handled rather than assumed away (the faster row survives,
 * as everywhere else), though there should be none: suffixed keys were
 * REJECTED by validation until now, so no row can already hold one.
 */

/** Rows that need moving, and where each one goes. */
const NEEDS_SUFFIX = `a.players > 1 AND position('@' in a.board_key) = 0`;
const TARGET = `a.board_key || '@' || a.players`;

exports.up = (pgm) => {
    // The incoming row loses a tie: an existing correctly-keyed record is the
    // one someone actually set under that identity.
    pgm.sql(`
        DELETE FROM user_board_bests a
        USING user_board_bests b
        WHERE a.user_id = b.user_id
          AND ${NEEDS_SUFFIX}
          AND b.board_key = ${TARGET}
          AND b.seconds <= a.seconds
    `);

    pgm.sql(`
        DELETE FROM user_board_bests b
        USING user_board_bests a
        WHERE a.user_id = b.user_id
          AND ${NEEDS_SUFFIX}
          AND b.board_key = ${TARGET}
          AND b.seconds > a.seconds
    `);

    pgm.sql(`
        UPDATE user_board_bests a
        SET board_key = ${TARGET}
        WHERE ${NEEDS_SUFFIX}
    `);
};

/**
 * Back to one row per board, keeping the faster where a group and a solo record
 * collapse together — which is lossy, and unavoidably so: the two identities
 * the up migration separated do not fit in one key.
 */
exports.down = (pgm) => {
    pgm.sql(`
        DELETE FROM user_board_bests a
        USING user_board_bests b
        WHERE a.user_id = b.user_id
          AND position('@' in a.board_key) > 0
          AND b.board_key = split_part(a.board_key, '@', 1)
          AND b.seconds <= a.seconds
    `);

    pgm.sql(`
        DELETE FROM user_board_bests b
        USING user_board_bests a
        WHERE a.user_id = b.user_id
          AND position('@' in a.board_key) > 0
          AND b.board_key = split_part(a.board_key, '@', 1)
          AND b.seconds > a.seconds
    `);

    pgm.sql(`
        UPDATE user_board_bests
        SET board_key = split_part(board_key, '@', 1)
        WHERE position('@' in board_key) > 0
    `);
};
