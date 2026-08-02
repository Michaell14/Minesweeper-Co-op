/**
 * Palette selection.
 *
 * A theme is a `data-theme` attribute on <html>; everything else follows from
 * the palette overrides in app/tokens.css. There is no provider, no context and
 * no re-render: the attribute changes and CSS does the rest.
 */

export interface ThemeOption {
    /** The `data-theme` value. `null` is the default palette, which sets none. */
    id: string | null;
    label: string;
    /** One or two words — has to fit on a single line inside a card. */
    short: string;
    note: string;
}

export const THEMES: ThemeOption[] = [
    {
        id: null,
        label: "NES",
        short: "Default",
        note: "Blow the dust off the cartridge and claim the family TV for the night.",
    },
    {
        id: "gameboy",
        label: "Game Boy",
        short: "4 shades",
        note: "Take it back to the 90s with four shades of scratched-up Game Boy green.",
    },
    {
        id: "c64",
        label: "C64",
        short: "16 colours",
        note: "Boot up the 80s and watch that violet Commodore screen blink to life.",
    },
    {
        id: "dark",
        label: "Dark",
        short: "Inverted",
        note: "Turn the lamp off, turn the brightness down, and keep playing anyway.",
    },
];

export const THEME_STORAGE_KEY = "ms-theme";

const VALID_IDS = THEMES.map((t) => t.id).filter((id): id is string => id !== null);

/** Applies a theme to the document, or clears it for the default palette. */
export function applyTheme(id: string | null): void {
    if (id) document.documentElement.dataset.theme = id;
    else delete document.documentElement.dataset.theme;
}

/** Persists the choice, tolerating storage being unavailable or full. */
export function storeTheme(id: string | null): void {
    try {
        if (id) window.localStorage.setItem(THEME_STORAGE_KEY, id);
        else window.localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
        // Private browsing or a full quota — the theme just won't persist.
    }
}

/**
 * The stored choice, or null for the default. Unknown values are discarded: the
 * key is user-writable, and a stale id from a removed palette would stamp an
 * attribute matching no rules, rendering the default while claiming otherwise.
 */
export function readStoredTheme(): string | null {
    try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        return stored && VALID_IDS.includes(stored) ? stored : null;
    } catch {
        return null;
    }
}

/**
 * The no-flash script, inlined into <head> and run before first paint.
 *
 * Without it a themed player gets a flash of the default palette on every load,
 * because React has not hydrated and nothing has set the attribute yet.
 * Deliberately dependency-free — it runs before any bundle.
 */
export const NO_FLASH_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (t && ${JSON.stringify(VALID_IDS)}.indexOf(t) !== -1) {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`.trim();

/** How many cursor colours the palette defines. Keep in step with tokens.css. */
export const CURSOR_RAMP_SIZE = 6;

/**
 * A stable cursor colour for a player, as a token reference rather than a
 * literal: the value is written to a custom property and read by
 * board.module.css, so a theme switch moves live cursors with everything else.
 */
export function cursorColorForId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `var(--ms-palette-cursor-${(Math.abs(hash) % CURSOR_RAMP_SIZE) + 1})`;
}
