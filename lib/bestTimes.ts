import { ALL_PRESETS } from "@/shared/boardConfig";
import { boardPartOf, withPlayers } from "@/shared/boardKeys";

export { boardKey, playersForClear } from "@/shared/boardKeys";

/**
 * Your best clear of each board.
 *
 * Signed in, the record lives on the ACCOUNT (`user_board_bests`, written in
 * `recordResult`'s transaction). This module is the GUEST copy — localStorage,
 * so a record outlives its tab — plus the shape both paths share.
 * `hooks/useBestTime.ts` picks between them; `state/bestsSlice.ts` holds the
 * account's copy. Still written while signed in, so a dropped stats write
 * leaves the number standing and signing out lands on records. Keying is
 * `shared/boardKeys.js`, because the server keys the same records.
 */

export interface BestTime {
    /** Seconds taken. */
    seconds: number;
    /** Room size: a group clear is a different result from a solo one. */
    players: number;
    /** When it was set, so the display can say how old a record is. */
    at: number;
}

/** A finished run, before it is known to be a record. */
export interface Clear {
    seconds: number;
    players: number;
    at: number;
}

/** What the summary needs: whether this set a record, and what it beat. */
export interface BestResult {
    improved: boolean;
    previous: BestTime | null;
}

const STORAGE_KEY = "minesweeper_best_times";

/**
 * Set once this browser's records have been folded into an account. One flag
 * per browser, not per account: on a shared machine the second person to sign
 * in should not inherit the first's records. The /profile button remains.
 */
const IMPORTED_KEY = "minesweeper_bests_imported";

/** "Medium / Hard" for a board matching a preset, otherwise its dimensions. */
export const boardLabel = (rows: number, cols: number, mines: number) => {
    const preset = ALL_PRESETS.find(
        (p) => p.rows === rows && p.cols === cols && p.mines === mines,
    );
    return preset ? preset.title : `${rows}x${cols}, ${mines} mines`;
};

/**
 * The display name for a stored key; "16x16/40@3" reads as its board. Falls
 * back to the raw key so an unknown shape still renders.
 */
export const labelForKey = (key: string): string => {
    const match = boardPartOf(key).match(/^(\d+)x(\d+)\/(\d+)$/);
    if (!match) return key;
    return boardLabel(Number(match[1]), Number(match[2]), Number(match[3]));
};

/** A stored entry, or null if it is missing or has been corrupted. */
const parseEntry = (value: unknown): BestTime | null => {
    if (typeof value !== "object" || value === null) return null;
    const { seconds, players, at } = value as Record<string, unknown>;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
    return {
        seconds,
        // Older or hand-edited entries may lack these; a bad count would file
        // the record under a key nothing looks up.
        players: Number.isInteger(players) && (players as number) > 0 ? (players as number) : 1,
        at: typeof at === "number" && Number.isFinite(at) ? at : 0,
    };
};

/**
 * Re-files every entry under the key its own `players` implies. Records from
 * before the count was part of the key sit under the bare board string, so
 * this moves a group clear off the slot a solo run needs (the server's rows
 * were re-filed the same way in a migration). Idempotent, run on every read
 * (local and account) and persisted by the next write rather than here. Two
 * entries on one key: the faster survives, as in `recordBestTime`.
 */
export const byPlayerCount = (entries: Record<string, BestTime>): Record<string, BestTime> => {
    const filed: Record<string, BestTime> = {};

    for (const [key, entry] of Object.entries(entries)) {
        const correctKey = withPlayers(boardPartOf(key), entry.players);
        const existing = filed[correctKey];
        if (!existing || entry.seconds < existing.seconds) filed[correctKey] = entry;
    }

    return filed;
};

/**
 * Everything stored in this browser, with anything unreadable dropped:
 * localStorage is untrusted input, and a corrupt blob must not throw mid-game.
 */
export const readBestTimes = (): Record<string, BestTime> => {
    if (typeof window === "undefined") return {};

    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return {}; // Disabled or blocked, e.g. Safari private browsing.
    }
    if (!raw) return {};

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

    const out: Record<string, BestTime> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        const entry = parseEntry(value);
        if (entry) out[key] = entry;
    }
    return byPlayerCount(out);
};

/** This browser's best clear of one board, or null if it has never cleared it. */
export const readBestTime = (key: string): BestTime | null => readBestTimes()[key] ?? null;

/**
 * One board's record from whichever store is in play. A null `source` is BOTH
 * the guest case and "the account's records could not be fetched", which is
 * why the local copy is still written while signed in.
 */
export const bestFrom = (
    source: Record<string, BestTime> | null,
    key: string,
): BestTime | null => (source ? source[key] ?? null : readBestTime(key));

/** Whether a run beats what is already on record, and what it beat. */
export const improvementOver = (previous: BestTime | null, run: Clear): BestResult => ({
    improved: previous === null || run.seconds < previous.seconds,
    previous,
});

/**
 * Files a completed run in THIS BROWSER, keep-if-faster, on every clear signed
 * in or not (signed in, `recordAccountBest` applies the same rule to the
 * account's copy). The player suffix comes from the run, not the given key, so
 * a group clear cannot be filed on a solo slot; `byPlayerCount` applies the
 * same rule on read.
 */
export const recordBestTime = (givenKey: string, run: Clear): BestResult => {
    const key = withPlayers(boardPartOf(givenKey), run.players);
    const times = readBestTimes();
    const result = improvementOver(times[key] ?? null, run);

    if (result.improved && typeof window !== "undefined") {
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ ...times, [key]: run }),
            );
        } catch {
            // Full or blocked: the run still shows as a record this session.
        }
    }

    return result;
};

/** One record as the import endpoint takes it. */
export interface ImportableBest {
    boardKey: string;
    seconds: number;
    players: number;
    achievedAt: number;
}

/**
 * This browser's records as an import payload, newest first and capped: the
 * endpoint refuses an oversized payload outright, and an old record on a
 * custom board is the one worth losing.
 */
export const bestsForImport = (limit: number): ImportableBest[] =>
    Object.entries(readBestTimes())
        .map(([boardKey, best]) => ({
            boardKey,
            seconds: best.seconds,
            players: best.players,
            achievedAt: best.at,
        }))
        .sort((a, b) => b.achievedAt - a.achievedAt)
        .slice(0, limit);

/** Whether this browser's records have already been folded into an account. */
export const hasImportedBests = (): boolean => {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(IMPORTED_KEY) !== null;
    } catch {
        // Storage blocked: treat as done rather than retry forever.
        return true;
    }
};

/** Records that the fold-in happened, so it is not repeated on every sign-in. */
export const markBestsImported = (): void => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(IMPORTED_KEY, "1");
    } catch {
        // Unpersisted: the import runs again next sign-in, harmless (keep-if-faster).
    }
};

/** Forgets every record in this browser. Used by tests to reset between cases. */
export const clearBestTimes = () => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(IMPORTED_KEY);
    } catch {
        // Never persisted anyway.
    }
};
