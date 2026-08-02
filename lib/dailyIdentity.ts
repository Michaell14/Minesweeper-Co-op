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
 * The last record this page minted or read, so an attempt survives storage
 * being unavailable. Only ever a FALLBACK: localStorage is shared between tabs
 * and is the real record, so a readable one always wins over this.
 */
let inMemoryRecord: DailyIdentityRecord | null = null;

/** The current record, or null if there is none anywhere. */
const readRecord = (): DailyIdentityRecord | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const record = JSON.parse(raw) as DailyIdentityRecord;
            if (record?.token) return record;
        }
    } catch {
        // Malformed, or storage is blocked entirely.
    }
    return inMemoryRecord;
};

/**
 * The token an attempt already in flight belongs to, whatever day it was minted
 * on. Never mints one.
 *
 * Moves and score submissions use THIS, not the function below. Re-deriving
 * "today" on every click meant a browser crossing UTC midnight mid-attempt
 * silently swapped its token: the server still held the attempt under the old
 * one, so every move addressed a record that did not exist and was dropped
 * without a word. The board simply stopped responding.
 */
export function readDailyAttemptToken(): string {
    if (typeof window === "undefined") return "";
    return readRecord()?.token ?? "";
}

/** The token for today's attempt, minting one if this browser has none yet. */
export function getOrCreateDailyAttemptToken(): string {
    if (typeof window === "undefined") return "";

    const today = todayUtc();

    const record = readRecord();
    if (record?.date === today) return record.token;

    const minted = { date: today, token: generateToken() };
    inMemoryRecord = minted;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minted));
    } catch {
        // Blocked or full, e.g. Safari private browsing. The in-memory copy
        // keeps the attempt playable for this page; only surviving a reload is
        // lost. Throwing here used to take the whole feature out — the button
        // did nothing at all, because this call sits inside `startDaily`.
    }
    return minted.token;
}
