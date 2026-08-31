/**
 * The user-facing changelog. Hand-curated: entries are written for players,
 * not derived from git history.
 *
 * To add an entry: prepend it to CHANGELOG with a fresh ISO date (never reuse
 * an earlier entry's date — the unseen badge compares dates, so a same-day
 * second entry would go unnoticed by anyone who saw the first). Nothing else
 * to touch: app/sitemap.ts stamps lastModified itself, since the static
 * public/sitemap.xml it replaced is gone.
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
        id: 'friends-and-pings',
        date: '2026-08-31',
        tag: 'New',
        title: 'Friends, pings, and invites',
        bullets: [
            'Add friends by code, or straight from the summary of a game you just played together.',
            'See which friends are online, and invite one into your room without sending a code.',
            'Point at a cell with Shift+click to say "look here" — co-op only, since it would give a race away.',
        ],
    },
    {
        id: 'site-header',
        date: '2026-08-30',
        tag: 'Improved',
        title: 'A header, and a board that fits',
        bullets: [
            'Every page is now reachable from a header instead of five unlabelled icons in a corner.',
            'The board sizes itself to the screen it has, so a 16x16 game no longer runs past the bottom of a laptop.',
            'Room codes are suggested for you, and a taken one offers a fresh code instead of an error.',
            'Reloading mid-game keeps your score, and the browser Back button leaves the room properly.',
        ],
    },
    {
        id: 'drills',
        date: '2026-08-28',
        tag: 'New',
        title: 'Drills: practice the patterns',
        bullets: [
            'A trainer at /drills for the shapes that decide most boards — 1-1, 1-2, counting, and more.',
            'Get one wrong and it tells you why, and what would have got you unstuck.',
            'Lose a daily challenge to a pattern and it will offer you the drill for it.',
        ],
    },
    {
        id: 'emotes',
        date: '2026-08-22',
        tag: 'New',
        title: 'Reactions',
        bullets: [
            'Six things you can say to the room without typing a word.',
            'They fade on their own, and you can turn receiving them off in Settings.',
        ],
    },
    {
        id: 'account-in-game',
        date: '2026-08-21',
        tag: 'Improved',
        title: 'Your account, in the game',
        bullets: [
            'Signed in, you play under your account name and avatar rather than whatever the box remembered.',
            'Your best times follow the account instead of the browser, so they survive a new device.',
            'Four of the avatars now have to be earned.',
        ],
    },
    {
        id: 'avatars',
        date: '2026-08-12',
        tag: 'New',
        title: 'Profile pictures',
        bullets: [
            'A catalog of pixel-art avatars for signed-in accounts, each animating when you hover it.',
            'Your profile opens recent games at five and expands ten at a time.',
        ],
    },
    {
        id: 'achievements',
        date: '2026-08-08',
        tag: 'New',
        title: 'Achievements',
        bullets: [
            'A shelf of achievements to collect, from your first clear to thirty daily puzzles running.',
            'Your profile shows the whole shelf — including how close you are to the ones you have not earned yet.',
            'Games you already played count: anything you had qualified for lands the next time you finish one.',
        ],
    },
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

/** What the announcement banner draws. Null only if CHANGELOG is emptied. */
export const LATEST_ENTRY: ChangelogEntry | null = CHANGELOG[0] ?? null;

const STORAGE_KEY = 'minesweeper_changelog_last_seen';

/*
 * The banner's own key, deliberately not STORAGE_KEY: closing a strip is not
 * reading the changelog, and sharing one would clear the star's unseen dot for
 * someone who never opened it. Holds the dismissed entry's id, so the next
 * release speaks to people who closed the last one.
 */
const BANNER_KEY = 'minesweeper_banner_dismissed';

export function hasUnseenEntries(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const lastSeen = localStorage.getItem(STORAGE_KEY);
        return !lastSeen || lastSeen < LATEST_ENTRY_DATE; // ISO dates compare correctly as strings
    } catch {
        // Storage disabled (private mode, blocked cookies): these throw, and
        // an uncaught throw here unmounts the app from the header's effect.
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

export function isBannerDismissed(): boolean {
    if (typeof window === 'undefined' || !LATEST_ENTRY) return false;
    try {
        return localStorage.getItem(BANNER_KEY) === LATEST_ENTRY.id;
    } catch {
        // No storage means the banner shows, not that the app breaks.
        return false;
    }
}

export function dismissBanner(): void {
    if (typeof window === 'undefined' || !LATEST_ENTRY) return;
    try {
        localStorage.setItem(BANNER_KEY, LATEST_ENTRY.id);
    } catch {
        // Persistence is optional when storage is unavailable or full.
    }
}
