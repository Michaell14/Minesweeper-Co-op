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
    {
        id: "stpatricks",
        label: "St Patrick's",
        short: "Shamrock",
        note: "Every green there is, and a gold harp somewhere in the middle of it.",
    },
    {
        id: "pride",
        label: "Pride",
        short: "Six stripes",
        note: "Six stripes, and for once a cursor colour per player that means something.",
    },
    {
        id: "day-of-the-dead",
        label: "Día de Muertos",
        short: "Marigold",
        note: "Marigold and magenta by candlelight, for remembering people fondly.",
    },
    {
        id: "newyear",
        label: "New Year",
        short: "Midnight gold",
        note: "Midnight blue and champagne gold, and everyone counting backwards.",
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

const PALETTE_PREFIX = "--ms-palette-";

/**
 * The five entries a card previews, in order: the ground, the board, and the
 * three loudest intents. Chosen because they are what actually separates these
 * palettes at 14px — Game Boy and Minecraft are both green until you see the
 * closed cell, and the light/dark split reads entirely off `paper`.
 */
export const SWATCH_TOKENS = ["paper", "cell-closed", "blue", "green", "red"] as const;

/** Palette entries declared by `:root` and every theme block, in ONE sheet walk. */
function paletteBlocks(): Map<string, Record<string, string>> {
    const blocks = new Map<string, Record<string, string>>();
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        // Cross-origin sheets throw on access; none of ours are, but a browser
        // extension's might be.
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        for (const rule of Array.from(rules)) {
            if (!(rule instanceof CSSStyleRule)) continue;
            const selector = rule.selectorText;
            if (selector !== ":root" && !selector.startsWith(':root[data-theme=')) continue;
            const found = blocks.get(selector) ?? {};
            for (const prop of Array.from(rule.style)) {
                if (prop.startsWith(PALETTE_PREFIX)) {
                    found[prop] = rule.style.getPropertyValue(prop).trim();
                }
            }
            blocks.set(selector, found);
        }
    }
    return blocks;
}

/**
 * Swatch colours for every built-in palette, keyed by theme id (null = default).
 *
 * Read out of the CSSOM rather than listed here, for the same reason the /ds
 * coverage report is: a second copy of sixty colours would drift from
 * tokens.css silently, and the card would then lie about the palette it
 * offers. Reading the RULES rather than computed style is what lets a Game Boy
 * card show Game Boy green while the page is painted in NES — the cascade only
 * ever holds the palette currently applied.
 *
 * A theme inheriting an entry (Dark keeps the NES intent hues) falls back to
 * `:root`, so its swatches show what it will actually paint.
 *
 * Empty when the stylesheet is not readable — jsdom, or before styles load —
 * which renders no swatches rather than five transparent boxes.
 */
export function readSwatches(): Map<string | null, string[]> {
    const out = new Map<string | null, string[]>();
    for (const [id, entries] of readPaletteEntries(SWATCH_TOKENS)) {
        const swatches = SWATCH_TOKENS.map((token) => entries[token]);
        if (swatches.every(Boolean)) out.set(id, swatches);
    }
    return out;
}

/**
 * The requested palette entries for every built-in palette, keyed by theme id.
 * Same sheet walk as the swatches — a theme that inherits an entry gets the
 * `:root` one, so the values are what it will actually paint.
 */
export function readPaletteEntries(
    tokens: readonly string[],
): Map<string | null, Record<string, string>> {
    const out = new Map<string | null, Record<string, string>>();
    if (typeof document === "undefined") return out;

    const blocks = paletteBlocks();
    const base = blocks.get(":root");
    if (!base) return out;

    for (const { id } of THEMES) {
        const overrides = (id && blocks.get(`:root[data-theme="${id}"]`)) || {};
        const entries: Record<string, string> = {};
        for (const token of tokens) {
            const value = overrides[`${PALETTE_PREFIX}${token}`] ?? base[`${PALETTE_PREFIX}${token}`];
            if (value) entries[token] = value;
        }
        out.set(id, entries);
    }
    return out;
}

/**
 * The same five, for a custom palette. Pure — a custom theme carries its
 * resolved palette on the object, so there is no sheet to read.
 */
export function swatchesFromPalette(palette: Record<string, string>): string[] {
    const swatches = SWATCH_TOKENS.map((token) => palette[`${PALETTE_PREFIX}${token}`]);
    return swatches.every(Boolean) ? swatches : [];
}

/**
 * Removes every inline `--ms-palette-*` override a custom theme stamped.
 * Walked off the style object itself rather than a hardcoded key list, so a
 * palette entry added later cannot be left behind as a stale override.
 */
function clearCustomPaletteOverrides(): void {
    const style = document.documentElement.style;
    for (let i = style.length - 1; i >= 0; i--) {
        const name = style[i];
        if (name.startsWith(PALETTE_PREFIX)) style.removeProperty(name);
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
            if (name.startsWith(PALETTE_PREFIX)) {
                document.documentElement.style.setProperty(name, value);
            }
        }
        return;
    }
    if (id) document.documentElement.dataset.theme = id;
    else delete document.documentElement.dataset.theme;
}

/**
 * The palette currently painted, as the attribute holds it — null for the
 * default palette and for a custom one, which stamps properties instead.
 *
 * Read rather than derived because four different things set it: the no-flash
 * script before any bundle runs, the settings slice, a holiday in season, and
 * the /ds catalog previewing a palette. Anything wanting to follow the paint
 * (components/ds/sprites.tsx) follows this.
 */
export function getAppliedTheme(): string | null {
    if (typeof document === "undefined") return null;
    return document.documentElement.dataset.theme ?? null;
}

export function subscribeAppliedTheme(onChange: () => void): () => void {
    if (typeof document === "undefined") return () => {};
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
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
