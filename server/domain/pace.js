/**
 * Pace milestones for the daily challenge's share text: how long the run took
 * to reach each tenth of the board's safe cells.
 *
 * Deliberately about WHEN, never WHERE. Every player gets the identical seeded
 * board, so anything positional in a share (opened cells, flag placements)
 * spoils the puzzle for whoever reads it — timing is the only axis that is
 * both personal and safe to publish. See lib/dailyShare.ts, which draws the bar.
 *
 * Pure — no I/O, no clock. Callers pass elapsedMs from their own timestamps.
 */

const PACE_DECILES = 10;

/** Opened and total SAFE cells. Mines count toward neither side. */
const safeProgress = (board) => {
    let opened = 0;
    let total = 0;
    for (const row of board) {
        for (const cell of row) {
            if (cell.isMine) continue;
            total++;
            if (cell.isOpen) opened++;
        }
    }
    return { opened, total };
};

/**
 * Milestones as stored: index i is the elapsedMs when progress first reached
 * (i+1)/10 of the safe cells. Extends `milestones` with `elapsedMs` for every
 * decile the board has crossed beyond what is recorded — a big cascade can
 * cross several at once, and each gets the same stamp (that stretch took no
 * extra time). Never rewrites an existing entry: a milestone is "first
 * reached", so the earliest stamp stands.
 */
const withCrossedMilestones = (milestones, board, elapsedMs) => {
    const { opened, total } = safeProgress(board);
    const out = milestones.slice(0, PACE_DECILES);
    if (total === 0) return out;

    const crossed = Math.min(Math.floor((PACE_DECILES * opened) / total), PACE_DECILES);
    while (out.length < crossed) out.push(elapsedMs);
    return out;
};

/**
 * The stored JSON field back to an array. Redis holds strings, and attempts
 * from before milestones existed have no field at all — both read as [] so
 * every caller can treat "no pace data" and "none recorded yet" the same way.
 */
const parseMilestones = (raw) => {
    if (!raw) return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0).slice(0, PACE_DECILES);
};

module.exports = { PACE_DECILES, safeProgress, withCrossedMilestones, parseMilestones };
