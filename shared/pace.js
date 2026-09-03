/**
 * Safe-cell progress and pace deciles for the daily share, shared by both
 * halves so the decile count cannot drift: the server records crossings
 * (domain/pace.js, game/daily.js), the client draws the bar (lib/dailyShare.ts).
 * Pure, like everything in shared/ (CLAUDE.md trap #1).
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
 * (i+1)/10 of the safe cells. Never rewrites an existing entry.
 */
const withCrossedMilestones = (milestones, board, elapsedMs) => {
    const { opened, total } = safeProgress(board);
    const out = milestones.slice(0, PACE_DECILES);
    if (total === 0) return out;

    const crossed = Math.min(Math.floor((PACE_DECILES * opened) / total), PACE_DECILES);
    while (out.length < crossed) out.push(elapsedMs);
    return out;
};

module.exports = { PACE_DECILES, safeProgress, withCrossedMilestones };
