import type { Cell, DailyAttemptStatus } from "@/shared/socketPayloads";
import { PACE_DECILES, safeProgress } from "@/shared/pace";
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

/**
 * The pace bar: one emoji per tenth of the board's safe cells — 🟩 on pace or
 * faster, 🟨 slower than the run's average, a loss truncated with 💥 and ⬜.
 * Same spoiler rule as everything here: pacing is about WHEN, so it is
 * shareable; the board is about WHERE, so it never is.
 *
 * Null whenever the data can't honestly support a bar.
 */
export function buildPaceBar(milestones: number[], won: boolean): string | null {
    const ms = milestones
        .filter((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)
        .slice(0, PACE_DECILES);
    if (ms.some((n, i) => i > 0 && n < ms[i - 1])) return null;
    if (won && ms.length !== PACE_DECILES) return null;
    if (!won && ms.length === PACE_DECILES) return null; // 100% open IS the win
    if (!won && ms.length === 0) return null; // died inside the first decile — no pace to show

    /*
     * The board's free opening stamps its deciles at elapsed 0, so a plain
     * mean over ALL deciles is dragged low enough that a perfectly steady run
     * reads as slow everywhere. Average over the deciles that took real time;
     * the free ones are trivially on-pace.
     */
    const durations = ms.map((stamp, i) => stamp - (i > 0 ? ms[i - 1] : 0));
    const paced = durations.filter((d) => d > 0).length;
    const average = paced > 0 ? ms[ms.length - 1] / paced : 0;

    const bar: string[] = durations.map((d) => (d <= average ? "🟩" : "🟨"));
    if (!won) {
        bar.push("💥");
        while (bar.length < PACE_DECILES) bar.push("⬜");
    }
    return bar.join("");
}

/**
 * Percentage of safe cells opened, from a TERMINAL board — one delivered with
 * `revealMines: true`, so closed cells carry a truthful `isMine`. On a live
 * projected board the projection zeroes that flag and this would overcount
 * the denominator; terminal states are the only place a share happens. Null
 * when there is no board to read.
 */
export function percentCleared(board: Cell[][]): number | null {
    const { opened, total } = safeProgress(board);
    if (total === 0) return null;
    return Math.round((100 * opened) / total);
}

/**
 * Wordle-style share text: outcome, time and pace only, never the board.
 * Everyone plays the identical seeded board today, so printing anything
 * POSITIONAL — opened cells, flag placements — would spoil the puzzle for
 * whoever reads it. Progress and streak are about when, not where, which is
 * what keeps them shareable.
 *
 * The link is the canonical /daily URL, never a parameterised one. The route
 * takes no parameters and reads none, so anything appended is either dead or a
 * way for a pasted link to make one reader's arrival differ from everyone
 * else's — on a puzzle whose whole premise is that it does not.
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
