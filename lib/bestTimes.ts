import { ALL_PRESETS } from "@/shared/boardConfig";
import { boardPartOf, withPlayers } from "@/shared/boardKeys";

export { boardKey, playersForClear } from "@/shared/boardKeys";

/**
 * Your best clear of each board.
 *
 * Signed in, the record lives on the ACCOUNT: the server writes
 * `user_board_bests` inside `recordResult`'s transaction, from its own clock,
 * and it follows you to whatever device you sign in on next. This module is the
 * GUEST copy of that — localStorage, for a browser with no account behind it —
 * plus the shape both paths share. `hooks/useBestTime.ts` picks between them;
 * `state/bestsSlice.ts` holds the account's copy once fetched.
 *
 * localStorage, not the sessionStorage the session id uses: a personal best
 * should outlive the tab it was set in. It is still written while signed in, so
 * a dropped stats write or a database blip leaves the number standing, and so
 * signing out lands you back on records rather than on nothing.
 *
 * How a record is KEYED — board dimensions and mine count, plus the size of the
 * group that cleared it — is `shared/boardKeys.js`, because the server keys the
 * same records the same way.
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
 * Set once this browser's records have been folded into an account.
 *
 * A single per-browser flag, not one per account: on a shared machine the
 * SECOND person to sign in should not have the first's records folded into
 * their profile, and skipping is the safe way to be wrong. The explicit button
 * on /profile stays for anyone who does want it.
 */
const IMPORTED_KEY = "minesweeper_bests_imported";

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

/**
 * The display name for a stored key — "16x16/40@3" reads as its board, since
 * anywhere a key is listed shows the player count in its own right. Falls back
 * to the raw key, so a shape this build does not know still renders as itself.
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
        // Older entries, or hand-edited ones, may be missing these. The count
        // is part of the KEY now, so a fractional one would file the record in
        // a slot nothing ever looks up.
        players: Number.isInteger(players) && (players as number) > 0 ? (players as number) : 1,
        at: typeof at === "number" && Number.isFinite(at) ? at : 0,
    };
};

/**
 * Re-files every entry under the key its own `players` implies.
 *
 * Records written before the count was part of the key are all under the bare
 * board string, whatever group set them — so this is what moves a three-player
 * clear off the slot a solo run needs. Nothing is invented: the count has been
 * stored on each record all along, and one missing (older still) reads as 1.
 * The server's own rows were re-filed by the same rule, in a migration.
 *
 * Idempotent, because a correctly-filed entry already produces its own key. It
 * runs on every read — of this browser's records and of the account's, which is
 * what keeps a server deployed ahead of its migration from serving keys the
 * client cannot look up — and is persisted by the next write rather than
 * written back here: a read that quietly rewrites storage is a surprise, and
 * being right in memory is enough for every caller.
 *
 * Where two entries land on one key — a board cleared solo before and after the
 * change — the faster survives, which is the same rule `recordBestTime` uses.
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
 * Everything stored in this browser, with anything unreadable dropped.
 * localStorage is untrusted input — a corrupt blob loses the records rather
 * than throwing on a page with a game running in it.
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
 * One board's record from whichever store is in play: the account's records
 * when signed in and they have arrived, this browser's otherwise.
 *
 * A null `source` is BOTH the guest case and "the account's records could not
 * be fetched" — which is deliberate, and the reason the local copy is still
 * written while signed in. A database blip shows the number this browser knows
 * rather than blanking a banner that was right a second ago.
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
 * Files a completed run in THIS BROWSER, keeping it only if it beats what is
 * already there. Returns whether it set a record, and what it beat.
 *
 * Called on every clear, signed in or not. When signed in the account's copy is
 * what the banner reads (`recordAccountBest` in the store applies the same rule
 * to it), and this is the fallback underneath it.
 *
 * The player suffix on the key is taken from the run itself rather than from
 * the key handed in, so a caller cannot file a group clear on a solo slot by
 * building the key one way and the record another. Same rule `byPlayerCount`
 * applies on read, which is what makes the two agree.
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
            // Full or blocked. The run still shows as a record this session;
            // only its persistence is lost.
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
 * This browser's records as an import payload, newest first and capped.
 *
 * Newest first because the cap has to drop something: a record set years ago on
 * a custom board is the one worth losing. Capped at all because the endpoint
 * refuses an oversized payload outright — without this a browser with enough
 * records would fail to import, every time, with nothing to show for it.
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
        // Storage blocked: treat it as done. Retrying forever against storage
        // that cannot remember the answer is worse than not offering.
        return true;
    }
};

/** Records that the fold-in happened, so it is not repeated on every sign-in. */
export const markBestsImported = (): void => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(IMPORTED_KEY, "1");
    } catch {
        // Unpersisted: the import runs again next sign-in, which is harmless —
        // it is keep-if-faster on the server.
    }
};

/** Forgets every record in this browser. Used by tests to reset between cases. */
export const clearBestTimes = () => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(IMPORTED_KEY);
    } catch {
        // Nothing to do; the records were never persisted anyway.
    }
};
