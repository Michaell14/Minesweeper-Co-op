import type { Cell, DailyAttemptStatus } from "@/shared/socketPayloads";
import { PACE_DECILES, safeProgress } from "@/shared/pace";
import { formatElapsed } from "@/lib/gameClock";

export interface ShareableDailyResult {
    date: string;
    status: DailyAttemptStatus;
    elapsedMs: number | null;
    rank: number | null;
    totalEntries: number | null;
    /** Consecutive daily wins ending on `date`. Shown from 2 up; a one-day streak is just the win. */
    streak?: number | null;
    /** How much of the board a LOSS cleared. Ignored on a win (it is 100%). */
    progressPercent?: number | null;
    /** Server-stamped pace milestones (see `dailyWon` in socketPayloads.ts). */
    milestones?: number[] | null;
}

/**
 * The pace bar: one emoji per tenth of the safe cells — 🟩 on pace, 🟨 slower
 * than the run's average, a loss truncated with 💥 and ⬜. Pacing is about WHEN,
 * so it is shareable; the board is about WHERE, so it never is. Null whenever
 * the data cannot support a bar.
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
     * The free opening stamps its deciles at elapsed 0, which drags a plain
     * mean low. Average over the deciles that took real time.
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
 * Percentage of safe cells opened, from a TERMINAL board (`revealMines: true`,
 * so closed cells carry a truthful `isMine`). A live projected board zeroes
 * that flag and would overcount the denominator. Null with no board.
 */
export function percentCleared(board: Cell[][]): number | null {
    const { opened, total } = safeProgress(board);
    if (total === 0) return null;
    return Math.round((100 * opened) / total);
}

/**
 * Wordle-style share text: outcome, time and pace, never the board. Everyone
 * plays the same seeded board, so anything POSITIONAL would spoil it. The link
 * is the plain /daily URL: the route reads no parameters, so anything appended
 * is dead or makes one reader's arrival differ from everyone else's.
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

/** Native share sheet first, clipboard as fallback. As in Grid.tsx's copyRoomLink, a denial is a silent no-op. */
export async function shareDailyResult(text: string): Promise<"shared" | "copied" | "failed"> {
    if (typeof navigator === "undefined") return "failed";

    if (navigator.share) {
        try {
            await navigator.share({ text });
            return "shared";
        } catch {
            // Cancelling the sheet rejects too, so fall through to the clipboard.
        }
    }

    try {
        await navigator.clipboard.writeText(text);
        return "copied";
    } catch {
        return "failed";
    }
}
