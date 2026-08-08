/**
 * The profile-stats reads (and the one write: the guest best-times import).
 * Same bearer transport and failure shape as the other account APIs — null
 * or false means "not available right now" and the UI shows that state.
 */

import { serverURL } from "@/lib/initSocket";
import { getBridgeToken } from "@/lib/authBridge";

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

export interface ProfilePayload {
    stats: ProfileStats;
    boardBests: BoardBest[];
    recentGames: RecentGame[];
    dailyHistory: DailyDayResult[];
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

/** Folds this browser's localStorage bests into the account, keep-if-faster. */
export async function importBests(
    bests: { boardKey: string; seconds: number; players: number; achievedAt: number }[],
): Promise<boolean> {
    const res = await request("/api/stats/import-bests", "POST", { bests });
    return !!res && (res.status === 204 || res.ok);
}
