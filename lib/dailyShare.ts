import type { Cell, DailyAttemptStatus } from "@/shared/socketPayloads";
import { formatElapsed } from "@/lib/gameClock";

export interface ShareableDailyResult {
    date: string;
    status: DailyAttemptStatus;
    elapsedMs: number | null;
    rank: number | null;
    totalEntries: number | null;
    /** Consecutive daily wins ending on `date`. Only shown from 2 up — a
     * one-day "streak" is just the win the line above already reports. */
    streak?: number | null;
    /** How much of the board a LOSS cleared. Ignored on a win (it is 100%). */
    progressPercent?: number | null;
    /** Server-stamped pace milestones (see `dailyWon` in socketPayloads.ts). */
    milestones?: number[] | null;
}

const PACE_DECILES = 10;

/**
 * The pace bar: one emoji per tenth of the board's safe cells, colored by
 * whether that stretch beat the run's own average pace — 🟩 on pace or
 * faster, 🟨 slower. A loss truncates at the decile the run died in (💥) and
 * pads the rest ⬜. Same spoiler rule as everything here: pacing is about
 * WHEN, so it is shareable; the board is about WHERE, so it never is.
 *
 * Null rather than a wrong bar when the data can't support one: no
 * milestones at all (a pre-pace attempt), a "win" missing deciles, or
 * timestamps out of order (garbage in storage).
 */
export function buildPaceBar(milestones: number[], won: boolean): string | null {
    const ms = milestones
        .filter((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)
        .slice(0, PACE_DECILES);
    if (ms.some((n, i) => i > 0 && n < ms[i - 1])) return null;
    if (won && ms.length !== PACE_DECILES) return null;
    if (!won && ms.length === PACE_DECILES) return null; // 100% open IS the win
    if (!won && ms.length === 0) return null; // died inside the first decile — no pace to show

    const average = ms[ms.length - 1] / ms.length;
    const bar: string[] = ms.map((stamp, i) => (stamp - (i > 0 ? ms[i - 1] : 0) <= average ? "🟩" : "🟨"));
    if (!won) {
        bar.push("💥");
        while (bar.length < PACE_DECILES) bar.push("⬜");
    }
    return bar.join("");
}

/**
 * Percentage of safe cells opened, from a TERMINAL board — one delivered with
 * `revealMines: true`, so closed cells carry a truthful `isMine`. On a live
 * projected board the projection zeroes that flag and this would overcount the
 * denominator; terminal states are the only place a share happens, so that
 * board is the only kind this ever sees. Null when there is no board to read
 * (an attempt from before final boards were stored).
 */
export function percentCleared(board: Cell[][]): number | null {
    let safeOpened = 0;
    let safeTotal = 0;
    for (const row of board) {
        for (const cell of row) {
            if (cell.isMine) continue;
            safeTotal++;
            if (cell.isOpen) safeOpened++;
        }
    }
    if (safeTotal === 0) return null;
    return Math.round((100 * safeOpened) / safeTotal);
}

/**
 * Wordle-style share text: outcome, time and pace only, never the board.
 * Everyone plays the identical seeded board today, so printing anything
 * POSITIONAL — opened cells, flag placements — would spoil the puzzle for
 * whoever reads it. Progress and streak are about when, not where, which is
 * what keeps them shareable.
 *
 * The link is plain /daily, never an auto-start parameter: starting consumes
 * the reader's one attempt for the day (see lib/dailyIntent.ts).
 */
export function buildDailyShareText({ date, status, elapsedMs, rank, totalEntries, streak, progressPercent, milestones }: ShareableDailyResult): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const timeLabel = elapsedMs !== null ? formatElapsed(elapsedMs) : "?";
    const won = status === "completed";

    const lines = [`🧩 Minesweeper Daily Challenge — ${date}`];

    if (won) {
        lines.push(
            rank !== null && totalEntries !== null
                ? `✅ Solved in ${timeLabel} — Rank #${rank} of ${totalEntries}`
                : `✅ Solved in ${timeLabel}`,
        );
        if (typeof streak === "number" && streak >= 2) {
            lines.push(`🔥 ${streak}-day streak`);
        }
    } else {
        lines.push(
            typeof progressPercent === "number"
                ? `💥 Hit a mine at ${timeLabel} — ${progressPercent}% cleared`
                : `💥 Hit a mine at ${timeLabel}`,
        );
    }

    const paceBar = milestones ? buildPaceBar(milestones, won) : null;
    if (paceBar) lines.push(paceBar);

    lines.push(`Play today's puzzle: ${origin}/daily`);
    return lines.join("\n");
}

/**
 * Native share sheet first, clipboard as the fallback. Mirrors Grid.tsx's
 * copyRoomLink: a denial is a silent no-op, not an error worth surfacing.
 */
export async function shareDailyResult(text: string): Promise<"shared" | "copied" | "failed"> {
    if (typeof navigator === "undefined") return "failed";

    if (navigator.share) {
        try {
            await navigator.share({ text });
            return "shared";
        } catch {
            // Cancelling the sheet rejects too -- a valid outcome, so fall
            // through to the clipboard rather than report a failure.
        }
    }

    try {
        await navigator.clipboard.writeText(text);
        return "copied";
    } catch {
        return "failed";
    }
}
