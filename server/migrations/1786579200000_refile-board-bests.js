// Re-files user_board_bests under the client's key identity: group clears
// take a `@players` suffix, solo stays bare (statsRepo.bestKeyOf), faster
// surviving on collision. One statement so a row committed mid-migration is
// never deleted without being re-filed; rows old dynos write AFTER this runs
// are swept by statsRepo.refileLegacyBests at every boot.
//
// Pre-branch PVP wins carry players = 2 with no stored mode, so they re-file
// under @2 and the sync then shows them client-side as 2-player co-op bests
// until a real duo clear (typically faster) displaces them. Accepted: the
// data cannot tell a racer from a pair.

exports.up = (pgm) => {
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
    // DISTINCT ON keeps the fastest per bare slot — several group sizes can
    // share one board, and ON CONFLICT refuses the same row twice. Lossy
    // where bare and suffixed both existed, like any contraction.
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
