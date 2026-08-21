/**
 * The profile-stats reads (and the one write: the guest best-times import).
 * Same bearer transport and failure shape as the other account APIs — null
 * or false means "not available right now" and the UI shows that state.
 */

import { serverURL } from "@/lib/initSocket";
import { getBridgeToken } from "@/lib/authBridge";
import { byPlayerCount, type BestTime, type ImportableBest } from "@/lib/bestTimes";

/**
 * How many recent games a profile keeps. Kept in step BY HAND with
 * `RECENT_WINDOW` in server/data/statsRepo.js — the server is CommonJS and
 * cannot share the constant, the same trade the socket payloads make.
 */
export const RECENT_WINDOW = 50;

/**
 * How many records one import may carry. Kept in step BY HAND with
 * `MAX_BEST_IMPORT_ENTRIES` in server/validation.js, the same trade
 * RECENT_WINDOW makes — and it matters more here, because the server refuses
 * an oversized payload whole rather than truncating it.
 */
export const MAX_BEST_IMPORT = 100;

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
 * Just the account's board records, keyed the way the game looks them up.
 *
 * Its own endpoint rather than a slice of `fetchStats`: this is fetched by
 * every tab with a board in it, and the profile read runs four more queries for
 * things a game page never shows.
 *
 * Null means "not available right now" — signed out, or the stats service is
 * down — and the caller falls back to this browser's records rather than
 * blanking a number that was right a second ago.
 */
export async function fetchBoardBests(): Promise<Record<string, BestTime> | null> {
    const res = await request("/api/stats/bests", "GET");
    if (!res || !res.ok) return null;
    const payload = (await res.json().catch(() => null)) as { boardBests?: BoardBest[] } | null;
    if (!payload || !Array.isArray(payload.boardBests)) return null;

    const bests: Record<string, BestTime> = {};
    for (const best of payload.boardBests) {
        const at = Date.parse(best.achievedAt);
        bests[best.boardKey] = {
            seconds: best.seconds,
            players: best.players,
            at: Number.isFinite(at) ? at : 0,
        };
    }
    // Re-filed by the count on each record, exactly as the browser's own copy
    // is: a server deployed ahead of the key migration would otherwise serve
    // keys the client cannot look up, and the banner would read as blank.
    return byPlayerCount(bests);
}

/** Folds this browser's localStorage bests into the account, keep-if-faster. */
export async function importBests(bests: ImportableBest[]): Promise<boolean> {
    const res = await request("/api/stats/import-bests", "POST", { bests });
    return !!res && (res.status === 204 || res.ok);
}
