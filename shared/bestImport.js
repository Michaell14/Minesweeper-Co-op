// The best-times import contract, shared so the client's push filter and the
// server's validation cannot drift — the server rejects a whole payload on
// one bad entry, so a drifted bound would silently kill the push. Pure: no
// I/O (the layering test exempts shared/ and cannot check this).

const MAX_BEST_IMPORT_ENTRIES = 100;
const MAX_BEST_SECONDS = 86400; // a day; longer runs stay local-only
// 2100-01-01 UTC. Postgres to_timestamp overflows far below Number.MAX_VALUE,
// so finiteness alone is not enough.
const MAX_BEST_ACHIEVED_AT = 4102444800000;
// lib/bestTimes.ts's key grammar: rows x cols / mines, @players for groups.
const BOARD_KEY_PATTERN = /^\d{1,3}x\d{1,3}\/\d{1,4}(@\d{1,3})?$/;

// seconds must be an INTEGER: the column is integer and Postgres rejects
// fractional text input rather than rounding it.
const isValidBestEntry = (best) =>
    typeof best === 'object' &&
    best !== null &&
    typeof best.boardKey === 'string' &&
    BOARD_KEY_PATTERN.test(best.boardKey) &&
    Number.isInteger(best.seconds) &&
    best.seconds >= 0 &&
    best.seconds <= MAX_BEST_SECONDS &&
    Number.isInteger(best.players) &&
    best.players >= 1 &&
    best.players <= 100 &&
    Number.isFinite(best.achievedAt) &&
    best.achievedAt >= 0 &&
    best.achievedAt <= MAX_BEST_ACHIEVED_AT;

module.exports = {
    MAX_BEST_IMPORT_ENTRIES,
    MAX_BEST_SECONDS,
    MAX_BEST_ACHIEVED_AT,
    BOARD_KEY_PATTERN,
    isValidBestEntry,
};
