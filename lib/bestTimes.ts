import { ALL_PRESETS } from "@/shared/boardConfig";

/**
 * Your best clear of each board, kept in this browser.
 *
 * localStorage, not the sessionStorage the session id uses: a personal best
 * should outlive the tab it was set in. Nothing is sent to the server — with no
 * accounts to authenticate against, a server-side table would be a scoreboard of
 * whoever edited a socket payload last.
 *
 * Boards are keyed by DIMENSIONS AND MINE COUNT, never the size/difficulty
 * labels: `setDimensions` gives a joiner the room's numbers and leaves their
 * labels alone, so keying on a label files their win under the wrong board.
 */

export interface BestTime {
    /** Seconds taken. */
    seconds: number;
    /**
     * How many were in the room. Stored because clearing Medium with three
     * friends is a real result but not the same result as clearing it alone, and
     * a "best" that mixes the two means nothing.
     */
    players: number;
    /** When it was set, so the display can say how old a record is. */
    at: number;
}

const STORAGE_KEY = "minesweeper_best_times";

/** Identifies a board by what it actually is, not by what it was called. */
export const boardKey = (rows: number, cols: number, mines: number) =>
    `${rows}x${cols}/${mines}`;

/**
 * "Medium / Hard" for a board matching a preset, otherwise its dimensions.
 * Derived from the numbers for the same reason the key is.
 */
export const boardLabel = (rows: number, cols: number, mines: number) => {
    const preset = ALL_PRESETS.find(
        (p) => p.rows === rows && p.cols === cols && p.mines === mines,
    );
    return preset ? preset.title : `${rows}x${cols}, ${mines} mines`;
};

/** A stored entry, or null if it is missing or has been corrupted. */
const parseEntry = (value: unknown): BestTime | null => {
    if (typeof value !== "object" || value === null) return null;
    const { seconds, players, at } = value as Record<string, unknown>;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
    return {
        seconds,
        // Older entries, or hand-edited ones, may be missing these.
        players: typeof players === "number" && players > 0 ? players : 1,
        at: typeof at === "number" && Number.isFinite(at) ? at : 0,
    };
};

/**
 * Everything stored, with anything unreadable dropped. localStorage is untrusted
 * input — a corrupt blob loses the records rather than throwing on a page with a
 * game running in it.
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
    return out;
};

/** This browser's best clear of one board, or null if it has never cleared it. */
export const readBestTime = (key: string): BestTime | null => readBestTimes()[key] ?? null;

/**
 * Files a completed run, keeping it only if it beats what is already there.
 * Returns what the summary needs: whether this set a record, and what it beat.
 */
export const recordBestTime = (
    key: string,
    run: { seconds: number; players: number; at: number },
): { improved: boolean; previous: BestTime | null } => {
    const times = readBestTimes();
    const previous = times[key] ?? null;
    const improved = previous === null || run.seconds < previous.seconds;

    if (improved && typeof window !== "undefined") {
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ ...times, [key]: run }),
            );
        } catch {
            // Full or blocked. The run still shows as a record this session;
            // only its persistence is lost.
        }
    }

    return { improved, previous };
};

/** Forgets every record. Used by tests to reset between cases. */
export const clearBestTimes = () => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing to do; the records were never persisted anyway.
    }
};
