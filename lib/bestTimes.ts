import { ALL_PRESETS } from "@/shared/boardConfig";
import type { GameMode } from "@/shared/socketPayloads";

/**
 * Your best clear of each board, kept in this browser.
 *
 * localStorage, not the sessionStorage the session id uses: a personal best
 * should outlive the tab it was set in. Nothing is sent to the server — with no
 * accounts to authenticate against, a server-side table would be a scoreboard of
 * whoever edited a socket payload last.
 *
 * Boards are keyed by DIMENSIONS, MINE COUNT AND HOW MANY PLAYERS CLEARED IT —
 * never the size/difficulty labels: `setDimensions` gives a joiner the room's
 * numbers and leaves their labels alone, so keying on a label files their win
 * under the wrong board.
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

/**
 * Separates the board from the size of the group that cleared it. Never appears
 * in the board part, which is only digits, `x` and `/`.
 */
const PLAYERS_SEPARATOR = "@";

/** The board part of a key: everything before the player-count suffix. */
const boardPartOf = (key: string) => key.split(PLAYERS_SEPARATOR)[0];

/**
 * Solo keeps the bare board string, so every record set before player counts
 * were part of the key is still found where it was left; only group clears take
 * the suffix.
 */
const withPlayers = (boardPart: string, players: number) =>
    players > 1 ? `${boardPart}${PLAYERS_SEPARATOR}${players}` : boardPart;

/**
 * Identifies a RESULT: which board, and how many people cleared it.
 *
 * The player count is part of the identity, not a note attached to it. Two
 * people splitting a board finish it faster than one person can, more or less
 * by construction — so with one slot per board the group time took it and held
 * it, and every solo run afterwards silently failed to be a record. The count
 * was already being stored for exactly this reason (see `players` above — "a
 * best that mixes the two means nothing") and then used only for the caption.
 */
export const boardKey = (rows: number, cols: number, mines: number, players = 1) =>
    withPlayers(`${rows}x${cols}/${mines}`, players);

/**
 * How many players a clear counts as.
 *
 * A PVP race is SOLO work: you clear the whole board yourself and your opponent
 * never touches it, even though both of you are in the room. Counting the room
 * filed a race next to co-op clears that split the board between two people,
 * and captioned it "with 2 players".
 *
 * Read and write both go through this, which is the point — a record filed
 * under one count and looked up under another is simply never found again.
 */
export const playersForClear = (mode: GameMode, playersInRoom: number) =>
    mode === "pvp" ? 1 : Math.max(1, playersInRoom);

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
 *
 * Idempotent, because a correctly-filed entry already produces its own key. It
 * runs on every read and is persisted by the next write, rather than writing
 * back here — a read that quietly rewrites storage is a surprise, and being
 * right in memory is enough for every caller.
 *
 * Where two entries land on one key — a board cleared solo before and after the
 * change — the faster survives, which is the same rule `recordBestTime` uses.
 */
const byPlayerCount = (entries: Record<string, BestTime>): Record<string, BestTime> => {
    const filed: Record<string, BestTime> = {};

    for (const [key, entry] of Object.entries(entries)) {
        const correctKey = withPlayers(boardPartOf(key), entry.players);
        const existing = filed[correctKey];
        if (!existing || entry.seconds < existing.seconds) filed[correctKey] = entry;
    }

    return filed;
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
    return byPlayerCount(out);
};

/** This browser's best clear of one board, or null if it has never cleared it. */
export const readBestTime = (key: string): BestTime | null => readBestTimes()[key] ?? null;

/**
 * Files a completed run, keeping it only if it beats what is already there.
 * Returns what the summary needs: whether this set a record, and what it beat.
 *
 * The player suffix on the key is taken from the run itself rather than from
 * the key handed in, so a caller cannot file a group clear on a solo slot by
 * building the key one way and the record another. Same rule `byPlayerCount`
 * applies on read, which is what makes the two agree.
 */
export const recordBestTime = (
    givenKey: string,
    run: { seconds: number; players: number; at: number },
): { improved: boolean; previous: BestTime | null } => {
    const key = withPlayers(boardPartOf(givenKey), run.players);
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
