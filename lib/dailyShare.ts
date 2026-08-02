import type { DailyAttemptStatus } from "@/shared/socketPayloads";

export interface ShareableDailyResult {
    date: string;
    status: DailyAttemptStatus;
    elapsedMs: number | null;
    rank: number | null;
    totalEntries: number | null;
}

/** mm:ss for an elapsed-time value. Also used by the daily timer and leaderboard. */
export const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Wordle-style share text: outcome and time only, never the board. Everyone
 * plays the identical seeded board today, so printing mine positions would
 * spoil the puzzle for whoever reads it.
 */
export function buildDailyShareText({ date, status, elapsedMs, rank, totalEntries }: ShareableDailyResult): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const timeLabel = elapsedMs !== null ? formatElapsed(elapsedMs) : "?";

    const resultLine =
        status === "completed"
            ? rank !== null && totalEntries !== null
                ? `✅ Solved in ${timeLabel} — Rank #${rank} of ${totalEntries}`
                : `✅ Solved in ${timeLabel}`
            : `💥 Hit a mine at ${timeLabel}`;

    return [`🧩 Minesweeper Daily Challenge — ${date}`, resultLine, `Play today's puzzle: ${origin}`].join("\n");
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
