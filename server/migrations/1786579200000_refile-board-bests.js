/**
 * Re-files user_board_bests under the client's key identity: group clears
 * take a `@players` suffix (`16x16/40@3`), solo stays bare — the same
 * re-filing lib/bestTimes.ts applies to its own localStorage
 * (`byPlayerCount`), and what statsRepo.bestKeyOf writes from here on. Until
 * now the server kept ONE slot per board whatever the group size, so a
 * three-player clear could hold the slot a solo run should own.
 *
 * Where the suffixed slot already exists the faster time survives — the same
 * keep-if-faster rule as every other write to this table.
 *
 * PVP rows recorded before recordResult learned that a race is solo work
 * carry players = 2, and the mode is not stored, so they cannot be told apart
 * from co-op pairs; they re-file under `@2` with everything else. Harmless:
 * the solo slot repopulates on the next win, and the `@2` row still means
 * what it says — a clear recorded with two in the room.
 */

exports.up = (pgm) => {
    // One statement, not copy-then-delete: the release phase runs while the
    // PREVIOUS dynos still serve, and with two statements a bare row committed
    // between them would be deleted without ever being re-filed. A row the old
    // code writes AFTER this runs still lands bare and shadows the solo slot
    // until a faster solo win rewrites it — re-running this body by hand later
    // is safe and would sweep such stragglers too.
    //
    // No two moved rows collide with each other (source keys are unique per
    // user and the mapping only appends a suffix); ON CONFLICT is for a
    // suffixed row the new code already wrote.
    pgm.sql(`
        WITH moved AS (
            DELETE FROM user_board_bests
            WHERE players > 1 AND position('@' in board_key) = 0
            RETURNING user_id, board_key, seconds, players, achieved_at
        )
        INSERT INTO user_board_bests (user_id, board_key, seconds, players, achieved_at)
        SELECT user_id, board_key || '@' || players, seconds, players, achieved_at
        FROM moved
        ON CONFLICT (user_id, board_key) DO UPDATE SET
            seconds = EXCLUDED.seconds,
            players = EXCLUDED.players,
            achieved_at = EXCLUDED.achieved_at
        WHERE EXCLUDED.seconds < user_board_bests.seconds
    `);
};

exports.down = (pgm) => {
    // Folds suffixed rows back onto the bare slot. DISTINCT ON picks the
    // fastest per slot first — several group sizes can share one board, and
    // ON CONFLICT refuses to touch the same row twice in one statement.
    // Lossy where a bare and a suffixed record both existed, like any
    // contraction.
    pgm.sql(`
        WITH moved AS (
            DELETE FROM user_board_bests
            WHERE position('@' in board_key) > 0
            RETURNING user_id, board_key, seconds, players, achieved_at
        )
        INSERT INTO user_board_bests (user_id, board_key, seconds, players, achieved_at)
        SELECT DISTINCT ON (user_id, split_part(board_key, '@', 1))
            user_id, split_part(board_key, '@', 1), seconds, players, achieved_at
        FROM moved
        ORDER BY user_id, split_part(board_key, '@', 1), seconds ASC
        ON CONFLICT (user_id, board_key) DO UPDATE SET
            seconds = EXCLUDED.seconds,
            players = EXCLUDED.players,
            achieved_at = EXCLUDED.achieved_at
        WHERE EXCLUDED.seconds < user_board_bests.seconds
    `);
};
