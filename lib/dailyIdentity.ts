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

export function getOrCreateDailyAttemptToken(): string {
    if (typeof window === "undefined") return "";

    const today = todayUtc();

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const record = JSON.parse(raw) as DailyIdentityRecord;
            if (record?.date === today && record?.token) {
                return record.token;
            }
        }
    } catch {
        // Malformed record -- fall through and mint a fresh one.
    }

    const token = generateToken();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, token }));
    return token;
}
