import type { DailyAttemptStatus } from "@/shared/socketPayloads";

export interface ShareableDailyResult {
    date: string;
    status: DailyAttemptStatus;
    elapsedMs: number | null;
    rank: number | null;
    totalEntries: number | null;
}

/**
 * mm:ss for an elapsed-time value. Not share-specific -- the daily challenge's
 * timer display and leaderboard table use it too -- but this is where a
 * shared home for it was first needed, so it lives here rather than as three
 * separate copies.
 */
export const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Wordle-style share text: outcome and time only, never the board. Everyone
 * plays the identical seeded board today (see server/game/daily.js), so
 * printing mine positions here would spoil the puzzle for whoever reads it --
 * this only ever reports a result, the same shape win or lose.
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
 * Tries the native share sheet first (mobile mostly), falls back to a
 * clipboard copy. Mirrors Grid.tsx's copyRoomLink: silent no-op on denial or
 * unavailability rather than surfacing an error for something this low-stakes.
 */
export async function shareDailyResult(text: string): Promise<"shared" | "copied" | "failed"> {
    if (typeof navigator === "undefined") return "failed";

    if (navigator.share) {
        try {
            await navigator.share({ text });
            return "shared";
        } catch {
            // Cancelling the native share sheet also rejects this promise --
            // that's a valid outcome, not a failure, so fall through to the
            // clipboard rather than reporting an error for it.
        }
    }

    try {
        await navigator.clipboard.writeText(text);
        return "copied";
    } catch {
        return "failed";
    }
}
