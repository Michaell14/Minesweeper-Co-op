/**
 * Palette selection.
 *
 * A theme is a `data-theme` attribute on <html>; everything else follows from
 * the palette overrides in app/tokens.css. There is no provider, no context and
 * no re-render: the attribute changes and CSS does the rest.
 */

import { HOLIDAY_THEME_IDS } from "@/lib/holidays";

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
    {
        id: "amber",
        label: "Amber",
        short: "Phosphor",
        note: "One warm hue glowing off a terminal that has been on since Tuesday.",
    },
    {
        id: "spectrum",
        label: "Spectrum",
        short: "15 colours",
        note: "Load the tape, wait four minutes, and let those bright pixels clash.",
    },
    {
        id: "contrast",
        label: "High Contrast",
        short: "Max legibility",
        note: "Every colour picked to be read, in sunlight or with tired eyes.",
    },
    {
        id: "synthwave",
        label: "Synthwave",
        short: "Neon",
        note: "Drive the coastline at midnight with the neon turned all the way up.",
    },
    {
        id: "tetris",
        label: "Tetris",
        short: "Seven pieces",
        note: "Seven shapes falling faster than you can think. Still hearing the music.",
    },
    {
        id: "pacman",
        label: "Pac-Man",
        short: "Four ghosts",
        note: "One more quarter, one more maze, four ghosts closing in behind you.",
    },
    {
        id: "minecraft",
        label: "Minecraft",
        short: "Eight ores",
        note: "Dig down through the grass and see which ore the torchlight catches.",
    },
    {
        id: "mario",
        label: "Mario",
        short: "Coin gold",
        note: "Blue sky, gold blocks, and the little jump you do when one pays out.",
    },

    // Seasonal — see lib/holidays.ts for the windows that offer these.
    {
        id: "halloween",
        label: "Halloween",
        short: "Pumpkin",
        note: "Midnight purple, one lit pumpkin, and something green in the dark.",
    },
    {
        id: "christmas",
        label: "Christmas",
        short: "Fir & gold",
        note: "Snow on the window, fir on the door, and the good tin of biscuits open.",
    },
    {
        id: "lunar-new-year",
        label: "Lunar New Year",
        short: "Red & gold",
        note: "Red envelopes, gold lacquer, and the whole street awake at midnight.",
    },
    {
        id: "valentines",
        label: "Valentine's",
        short: "Blush",
        note: "Blush pink and rose gold, for a game about not stepping on anything.",
    },
    {
        id: "thanksgiving",
        label: "Thanksgiving",
        short: "Harvest",
        note: "Wheat, ochre and rust — the whole year's colours falling off the trees.",
    },
];

/**
 * The pre-settings storage key. The theme now lives in the settings blob
 * (lib/settings.ts, which owns persistence and the no-flash script); this key
 * survives only as the migration source a pre-blob browser is read from.
 */
export const THEME_STORAGE_KEY = "ms-theme";

/**
 * Every non-default theme id, for validating stored values: the storage is
 * user-writable, and a stale id from a removed palette would stamp an
 * attribute matching no rules — rendering the default while claiming
 * otherwise.
 */
export const VALID_THEME_IDS = THEMES.map((t) => t.id).filter(
    (id): id is string => id !== null,
);

/**
 * Whether a palette is offered only inside a date window. Derived from the
 * schedule rather than flagged on the entry: the schedule is what actually
 * decides, and a flag beside it would be a second copy of the same fact for
 * someone to forget.
 *
 * Seasonal palettes stay in THEMES year-round regardless — the list is what
 * `VALID_THEME_IDS` and the /ds contrast audit are built from, so dropping one
 * out of season would invalidate a stored id and hide the palette from the
 * audit. Only the picker filters (components/ThemeCards.tsx).
 */
export const isSeasonal = (id: string | null): boolean =>
    id !== null && HOLIDAY_THEME_IDS.includes(id);

/**
 * Removes every inline `--ms-palette-*` override a custom theme stamped.
 * Walked off the style object itself rather than a hardcoded key list, so a
 * palette entry added later cannot be left behind as a stale override.
 */
function clearCustomPaletteOverrides(): void {
    const style = document.documentElement.style;
    for (let i = style.length - 1; i >= 0; i--) {
        const name = style[i];
        if (name.startsWith("--ms-palette-")) style.removeProperty(name);
    }
}

/**
 * Applies a theme to the document.
 *
 * Built-in themes are a `data-theme` attribute; custom ones are the palette
 * stamped as inline custom properties (they do not exist in tokens.css, so
 * there is no attribute to set). Either path first clears the other's
 * residue — switching custom → built-in used to be the leak to worry about.
 */
export function applyTheme(id: string | null, customPalette?: Record<string, string>): void {
    clearCustomPaletteOverrides();
    if (customPalette) {
        delete document.documentElement.dataset.theme;
        for (const [name, value] of Object.entries(customPalette)) {
            if (name.startsWith("--ms-palette-")) {
                document.documentElement.style.setProperty(name, value);
            }
        }
        return;
    }
    if (id) document.documentElement.dataset.theme = id;
    else delete document.documentElement.dataset.theme;
}

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
