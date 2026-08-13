/**
 * The profile-stats reads (and the one write: the guest best-times import).
 * Same bearer transport and failure shape as the other account APIs — null
 * or false means "not available right now" and the UI shows that state.
 */

import { serverURL } from "@/lib/initSocket";
import { getBridgeToken } from "@/lib/authBridge";
import type { SyncedBest } from "@/lib/bestTimes";
import { MAX_BEST_IMPORT_ENTRIES, isValidBestEntry } from "@/shared/bestImport";

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
 * The account's board bests alone, timestamps converted to epoch ms — the
 * wire shape stops here. Null when unavailable (a backend predating the
 * userId field included: a pull with no account cannot be scoped to one).
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

export const MAX_BEST_PUSH = MAX_BEST_IMPORT_ENTRIES;

/**
 * Whether one record fits the server's import contract (shared/bestImport.js
 * — the same predicate the server validates with). Filtered per entry before
 * pushing: the server rejects a whole payload on one bad record, and
 * localStorage legally holds entries the contract refuses.
 */
export function isPushableBest(best: SyncedBest): boolean {
    return isValidBestEntry({
        boardKey: best.boardKey,
        seconds: best.seconds,
        players: best.players,
        achievedAt: best.at,
    });
}

/**
 * Folds this browser's localStorage bests into the account, keep-if-faster.
 * Returns the entries that actually landed (the caller's claim list), [] when
 * nothing was sendable, null when the push failed. Entries filtered or capped
 * out ride a later pass.
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
