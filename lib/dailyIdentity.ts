/**
 * The daily challenge's attempt token: a localStorage id, deliberately NOT
 * lib/session.ts's sessionStorage id.
 *
 * lib/session.ts exists to keep two tabs from colliding on the same room slot,
 * so it is scoped per-tab on purpose. Daily needs the opposite: the SAME token
 * across every tab of one browser, so two tabs can't each start a fresh
 * attempt. It also carries no meaning across days -- the stored record is
 * discarded and replaced the moment its date isn't today, per the product
 * decision that there is no persistent identity here, only a same-day flag.
 *
 * This is NOT an anti-cheat boundary. Clearing storage gets a free attempt --
 * an accepted gap given there is no account system to hang a real identity
 * off of. The server independently re-validates via dailyRepo regardless
 * (see server/controllers/dailyController.js), which is the actual backstop.
 */
const STORAGE_KEY = "minesweeper_daily_identity";

interface DailyIdentityRecord {
    date: string;
    token: string;
}

/** The client's own guess at "today," UTC. Used only to decide whether the
 * stored record is stale -- the server's own date is always authoritative
 * for anything that gates game state (see shared/socketPayloads.ts). */
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
