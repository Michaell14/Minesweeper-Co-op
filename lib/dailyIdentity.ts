/**
 * The daily challenge's attempt token: a localStorage id, NOT lib/session.ts's
 * per-tab sessionStorage id, because daily needs the SAME token across tabs so
 * two cannot each start an attempt. Discarded once its date is not today. Not
 * an anti-cheat boundary: clearing storage gets a free attempt, and dailyRepo
 * re-validates on the server regardless.
 */
const STORAGE_KEY = "minesweeper_daily_identity";

interface DailyIdentityRecord {
    date: string;
    token: string;
}

/** The client's guess at "today", UTC; only decides whether the stored record is stale. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

const generateToken = (): string =>
    typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);

/**
 * The token THIS page is playing under, set whenever an attempt starts. Not a
 * cache of localStorage: storage answers "does this browser have a token for
 * today", this answers "which attempt is on screen", and once a move exists no
 * later reading of storage may contradict it.
 */
let inFlightRecord: DailyIdentityRecord | null = null;

/** The stored record, or null if there is none or it cannot be read. */
const readStoredRecord = (): DailyIdentityRecord | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const record = JSON.parse(raw) as DailyIdentityRecord;
        return record?.token ? record : null;
    } catch {
        // Malformed, or storage is blocked entirely.
        return null;
    }
};

/**
 * The token the in-flight attempt belongs to, whatever storage says now. Never
 * mints one. Moves and submissions use THIS: re-deriving "today" per click
 * swapped the token when a browser crossed UTC midnight mid-attempt, and every
 * move then addressed a record that did not exist. Storage is the fallback
 * only when nothing has started on this page.
 */
export function readDailyAttemptToken(): string {
    if (typeof window === "undefined") return "";
    return (inFlightRecord ?? readStoredRecord())?.token ?? "";
}

/** The token for today's attempt, minting one if this browser has none yet. */
export function getOrCreateDailyAttemptToken(): string {
    if (typeof window === "undefined") return "";

    const today = todayUtc();

    // Storage, not the in-flight record: shared across tabs, so it stops a second attempt.
    const stored = readStoredRecord();
    if (stored?.date === today) {
        inFlightRecord = stored;
        return stored.token;
    }

    const minted = { date: today, token: generateToken() };
    inFlightRecord = minted;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minted));
    } catch {
        // Blocked or full (Safari private browsing). `inFlightRecord` keeps the
        // attempt playable; throwing here used to take the whole feature out.
    }
    return minted.token;
}
