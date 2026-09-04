/**
 * Re-files user_board_bests under the key each row's own `players` implies
 * (`shared/boardKeys.js`). Keyed by board alone, a group clear took the slot
 * and no solo run could be a record again. The count was stored all along.
 *
 * Unrecoverable: a PVP race recorded `players: 2` before this change, with no
 * mode column to tell it from a two-player co-op clear. Those move to '@2',
 * the safe direction. Collisions keep the faster row, though there should be
 * none: validation rejected suffixed keys until now.
 */

/** Rows that need moving, and where each one goes. */
const NEEDS_SUFFIX = `a.players > 1 AND position('@' in a.board_key) = 0`;
const TARGET = `a.board_key || '@' || a.players`;

exports.up = (pgm) => {
    // The incoming row loses a tie: the existing record was set under that identity.
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

/** Back to one row per board, keeping the faster where two collapse. Lossy, unavoidably. */
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
