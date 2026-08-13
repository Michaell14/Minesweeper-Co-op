/**
 * The profile-stats reads (and the one write: the guest best-times import).
 * Same bearer transport and failure shape as the other account APIs — null
 * or false means "not available right now" and the UI shows that state.
 */

import { serverURL } from "@/lib/initSocket";
import { getBridgeToken } from "@/lib/authBridge";
import type { SyncedBest } from "@/lib/bestTimes";

/**
 * How many recent games a profile keeps. Kept in step BY HAND with
 * `RECENT_WINDOW` in server/data/statsRepo.js — the server is CommonJS and
 * cannot share the constant, the same trade the socket payloads make.
 */
export const RECENT_WINDOW = 50;

export interface ProfileStats {
    coopGames: number;
    coopWins: number;
    pvpGames: number;
    pvpWins: number;
    dailyGames: number;
    dailyWins: number;
    currentStreak: number;
    bestStreak: number;
    lastPlayedDay: string | null;
    /**
     * The daily-clear streak (consecutive UTC days WON, keyed by puzzle date)
     * — distinct from currentStreak's any-mode play streak. The backend may
     * briefly predate these fields after a deploy, so consumers `??` them.
     */
    dailyCurrentStreak: number;
    dailyBestStreak: number;
    lastDailyDay: string | null;
}

/** One calendar day of daily-challenge history. `day` is 'YYYY-MM-DD' UTC. */
export interface DailyDayResult {
    day: string;
    won: boolean;
    durationMs: number | null;
}

export interface BoardBest {
    boardKey: string;
    seconds: number;
    players: number;
    achievedAt: string;
}

export interface RecentGame {
    mode: "co-op" | "pvp" | "daily";
    boardKey: string;
    won: boolean;
    durationMs: number | null;
    players: number;
    finishedAt: string;
}

/**
 * One earned achievement. `id` is a catalog id from shared/achievements.js —
 * an id the catalog no longer knows is simply not rendered, which is what lets
 * one be retired without deleting anyone's row.
 */
export interface EarnedAchievement {
    id: string;
    earnedAt: string;
}

export interface ProfilePayload {
    stats: ProfileStats;
    boardBests: BoardBest[];
    recentGames: RecentGame[];
    dailyHistory: DailyDayResult[];
    /** Newest first. May be absent against a backend that predates the field. */
    achievements: EarnedAchievement[];
}

const request = async (path: string, method: string, body?: unknown): Promise<Response | null> => {
    const token = await getBridgeToken();
    if (!token) return null;
    try {
        return await fetch(`${serverURL}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
    } catch {
        return null;
    }
};

/** Everything the profile page shows, or null when unavailable. */
export async function fetchStats(): Promise<ProfilePayload | null> {
    const res = await request("/api/stats", "GET");
    if (!res || !res.ok) return null;
    return (await res.json().catch(() => null)) as ProfilePayload | null;
}

/**
 * The account's board bests alone — the sign-in sync's read, light enough to
 * hit on every page load. Null when unavailable, and the sync waits; a
 * backend that predates the userId field reads as unavailable too, since a
 * pull whose account is unknown cannot be scoped to it.
 *
 * Timestamps arrive as ISO strings and leave here as epoch ms: the wire shape
 * stops at this file, so the rest of the client only ever speaks
 * lib/bestTimes.ts's `SyncedBest`.
 */
export async function fetchBests(): Promise<{ userId: string; bests: SyncedBest[] } | null> {
    const res = await request("/api/stats/bests", "GET");
    if (!res || !res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data.userId !== "string" || !Array.isArray(data.bests)) return null;
    return {
        userId: data.userId,
        bests: (data.bests as BoardBest[]).map((best) => ({
            boardKey: best.boardKey,
            seconds: best.seconds,
            players: best.players,
            at: Date.parse(best.achievedAt) || 0,
        })),
    };
}

/**
 * How many records one push may carry — kept in step BY HAND with
 * `MAX_BEST_IMPORT_ENTRIES` in server/validation.js, the same trade as
 * RECENT_WINDOW above.
 */
export const MAX_BEST_PUSH = 100;

/**
 * Whether one record fits the server's import contract (`isValidBestImport`
 * in server/validation.js, kept in step by hand like the cap above).
 *
 * Checked per entry BEFORE pushing because the server rejects the whole
 * payload on one bad record, and localStorage legally holds entries the
 * contract refuses — a co-op board left open past a day clears with
 * seconds > 86400, and storage is user-editable. Unfiltered, one such entry
 * would silently disable the push half of the sync for good.
 */
export function isPushableBest(best: SyncedBest): boolean {
    return (
        /^\d{1,3}x\d{1,3}\/\d{1,4}(@\d{1,3})?$/.test(best.boardKey) &&
        Number.isFinite(best.seconds) &&
        best.seconds >= 0 &&
        best.seconds <= 86400 &&
        Number.isInteger(best.players) &&
        best.players >= 1 &&
        best.players <= 100 &&
        Number.isFinite(best.at)
    );
}

/**
 * Folds this browser's localStorage bests into the account, keep-if-faster.
 *
 * Entries outside the server's contract are left behind (`isPushableBest`)
 * and the payload is capped at MAX_BEST_PUSH — one bad or excess entry
 * otherwise 400s the whole push. Anything sliced off is picked up by a later
 * pass, once the entries ahead of it have landed and left `toPush`.
 *
 * Returns the entries that actually LANDED, so the caller can claim exactly
 * those for the account (lib/bestTimes.ts markBestsSynced) — never the ones
 * filtered or capped out, which no server holds. Null means the push failed;
 * an empty array means there was nothing sendable, which is success.
 */
export async function importBests(bests: SyncedBest[]): Promise<SyncedBest[] | null> {
    const sendable = bests.filter(isPushableBest).slice(0, MAX_BEST_PUSH);
    if (sendable.length === 0) return [];
    const payload = sendable.map(({ boardKey, seconds, players, at }) => ({
        boardKey,
        seconds,
        players,
        achievedAt: at,
    }));
    const res = await request("/api/stats/import-bests", "POST", { bests: payload });
    return res && (res.status === 204 || res.ok) ? sendable : null;
}
