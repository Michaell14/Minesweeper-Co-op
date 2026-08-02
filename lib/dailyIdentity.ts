/**
 * The daily challenge's attempt token: a localStorage id, deliberately NOT
 * lib/session.ts's per-tab sessionStorage id. Daily needs the opposite of what
 * that exists for — the SAME token across every tab, so two tabs can't each
 * start a fresh attempt. It carries no meaning across days: the record is
 * discarded the moment its date isn't today.
 *
 * NOT an anti-cheat boundary. Clearing storage gets a free attempt, an accepted
 * gap with no account system. The server re-validates via dailyRepo regardless,
 * which is the actual backstop.
 */
const STORAGE_KEY = "minesweeper_daily_identity";

interface DailyIdentityRecord {
    date: string;
    token: string;
}

/** The client's own guess at "today", UTC. Used only to decide whether the
 * stored record is stale -- the server's date gates everything else. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

const generateToken = (): string =>
    typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);

/**
 * The token THIS page is playing under, set whenever an attempt is started.
 *
 * Not a cache of localStorage, and deliberately not reconciled against it: the
 * two answer different questions. Storage answers "does this browser have a
 * token for today", which is what starting an attempt asks. This answers "which
 * attempt is on screen right now", which is what a move asks — and once a move
 * exists, the server has a record under this exact token and no later reading of
 * storage may contradict it.
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
 * The token the attempt in flight belongs to, whatever day it was minted on and
 * whatever storage says now. Never mints one.
 *
 * Moves and score submissions use THIS, not the function below. Re-deriving
 * "today" on every click meant a browser crossing UTC midnight mid-attempt
 * silently swapped its token: the server still held the attempt under the old
 * one, so every move addressed a record that did not exist and was dropped
 * without a word. The board simply stopped responding.
 *
 * Falling back to storage covers only the case where nothing has been started
 * on this page — there is no attempt to contradict, so the last one this browser
 * recorded is the best answer available.
 */
export function readDailyAttemptToken(): string {
    if (typeof window === "undefined") return "";
    return (inFlightRecord ?? readStoredRecord())?.token ?? "";
}

/** The token for today's attempt, minting one if this browser has none yet. */
export function getOrCreateDailyAttemptToken(): string {
    if (typeof window === "undefined") return "";

    const today = todayUtc();

    // Storage, not the in-flight record: it is shared across tabs, so this is
    // what stops a second tab starting a second attempt for the same day.
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
        // Blocked or full, e.g. Safari private browsing. `inFlightRecord` keeps
        // the attempt playable for this page; only surviving a reload is lost.
        // Throwing here used to take the whole feature out — the button did
        // nothing at all, because this call sits inside `startDaily`.
    }
    return minted.token;
}
