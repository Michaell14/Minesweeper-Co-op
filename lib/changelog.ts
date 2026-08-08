/**
 * The user-facing changelog. Hand-curated: entries are written for players,
 * not derived from git history.
 *
 * To add an entry: prepend it to CHANGELOG with a fresh ISO date (never reuse
 * an earlier entry's date — the unseen badge compares dates, so a same-day
 * second entry would go unnoticed by anyone who saw the first), and bump
 * <lastmod> on the /changelog entry in public/sitemap.xml.
 *
 * Seen-state lives in localStorage, not the sessionStorage the session id
 * uses: "has this person seen the news" is per-browser, not per-tab, and
 * sharing it across tabs is exactly what we want here.
 */

export type ChangeTag = 'New' | 'Improved' | 'Fixed';

export interface ChangelogEntry {
    id: string;        // stable slug, used as the React key
    date: string;      // ISO YYYY-MM-DD; the newest entry's date drives the badge
    tag: ChangeTag;
    title: string;
    bullets: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
    {
        id: 'keyboard-play',
        date: '2026-08-07',
        tag: 'New',
        title: 'Keyboard-only play',
        bullets: [
            'Sweep without a mouse: arrow keys move the cursor, Space or Enter reveals, F flags.',
            'Movement keys reclaim the board even when a button has focus.',
        ],
    },
    {
        id: 'sprite-sets',
        date: '2026-08-06',
        tag: 'New',
        title: 'Themes, palettes, and pixel art sets',
        bullets: [
            'Pick a color palette in Settings — including seasonal ones that arrive on their own schedule.',
            'Pin a mine & flag sprite set you like (Garden, Wizard, Straw Hat, Shinobi, Puppy, Robot, and more), independent of the palette.',
        ],
    },
    {
        id: 'quick-match',
        date: '2026-08-03',
        tag: 'New',
        title: 'Quick match',
        bullets: [
            'One button pairs you with a stranger for a 1v1 race.',
            'While you wait, a practice race against a target time keeps you warm.',
        ],
    },
    {
        id: 'accounts-profiles',
        date: '2026-08-02',
        tag: 'New',
        title: 'Accounts and profiles',
        bullets: [
            'Sign in to get a profile with your stats recorded across sessions.',
            'A new Settings page collects gameplay preferences, sound, and the theme editor.',
        ],
    },
    {
        id: 'daily-challenge',
        date: '2026-08-01',
        tag: 'New',
        title: 'Daily Challenge',
        bullets: [
            'One seeded board a day — everyone plays the same puzzle, ranked by time.',
            'Share your result when you clear it.',
        ],
    },
    {
        id: 'shareable-room-links',
        date: '2026-07-30',
        tag: 'New',
        title: 'Shareable room links',
        bullets: [
            'Invite friends with the Copy Link button in your room.',
            'Opening a shared link pre-fills the room code, so friends just pick a name and jump in.',
        ],
    },
    {
        id: 'board-size-and-difficulty',
        date: '2026-07-29',
        tag: 'Improved',
        title: 'Pick size and difficulty separately',
        bullets: [
            'Board size and difficulty are now independent choices when creating a room.',
            'Custom boards let you set exact dimensions, with the mine count derived from your chosen difficulty.',
        ],
    },
    {
        id: 'no-guess-boards',
        date: '2026-07-25',
        tag: 'New',
        title: 'No-guess boards',
        bullets: [
            'Every generated board is solvable by pure logic.',
            'No more 50/50 coin flips on the last few cells.',
        ],
    },
    {
        id: 'pvp-mode',
        date: '2026-01-18',
        tag: 'New',
        title: 'PvP mode',
        bullets: [
            'Go head-to-head: both players race the same board.',
            'First to clear it (or the highest score) wins, with instant rematches.',
        ],
    },
    {
        id: 'launch',
        date: '2024-12-25',
        tag: 'New',
        title: 'Minesweeper Co-op launches',
        bullets: [
            'Real-time co-op Minesweeper: create a room, share the code, and sweep together.',
            'Everyone sees the same board update live.',
        ],
    },
];

export const LATEST_ENTRY_DATE = CHANGELOG[0]?.date ?? '';

const STORAGE_KEY = 'minesweeper_changelog_last_seen';

export function hasUnseenEntries(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const lastSeen = localStorage.getItem(STORAGE_KEY);
        return !lastSeen || lastSeen < LATEST_ENTRY_DATE; // ISO dates compare correctly as strings
    } catch {
        // Storage disabled (private mode, blocked cookies): these throw, and
        // an uncaught throw here unmounts the app from the Footer's effect.
        // No storage means no badge, not no game.
        return false;
    }
}

export function markChangelogSeen(): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(STORAGE_KEY, LATEST_ENTRY_DATE);
    } catch {
        // Persistence is optional when storage is unavailable or full.
    }
}
