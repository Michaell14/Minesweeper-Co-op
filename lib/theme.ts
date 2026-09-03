/**
 * Palette selection. A theme is a `data-theme` attribute on <html>; the
 * palette overrides in app/tokens.css do the rest. No provider, no re-render.
 */

import { HOLIDAY_THEME_IDS } from "@/lib/holidays";

export interface ThemeOption {
    /** The `data-theme` value. `null` is the default palette, which sets none. */
    id: string | null;
    label: string;
    /** One or two words; must fit on one line inside a card. */
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

/** Pre-settings storage key; survives only as the migration source for a pre-blob browser. */
export const THEME_STORAGE_KEY = "ms-theme";

/**
 * Every non-default theme id, for validating stored values: a stale id from a
 * removed palette would stamp an attribute matching no rules.
 */
export const VALID_THEME_IDS = THEMES.map((t) => t.id).filter(
    (id): id is string => id !== null,
);

/**
 * Whether a palette is offered only inside a date window. Derived from the
 * schedule rather than flagged, so there is one copy of the fact. Seasonal
 * palettes stay in THEMES year-round: `VALID_THEME_IDS` and the /ds contrast
 * audit are built from it. Only the picker filters (components/ThemeCards.tsx).
 */
export const isSeasonal = (id: string | null): boolean =>
    id !== null && HOLIDAY_THEME_IDS.includes(id);

const PALETTE_PREFIX = "--ms-palette-";

/**
 * The five entries a card previews: ground, board, and the three loudest
 * intents, which is what separates these palettes at 14px.
 */
export const SWATCH_TOKENS = ["paper", "cell-closed", "blue", "green", "red"] as const;

/** Palette entries declared by `:root` and every theme block, in ONE sheet walk. */
function paletteBlocks(): Map<string, Record<string, string>> {
    const blocks = new Map<string, Record<string, string>>();
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        // Cross-origin sheets throw on access (a browser extension's might be).
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
 * Swatch colours for every built-in palette, keyed by theme id (null =
 * default). Read from the CSSOM so a second copy of sixty colours cannot drift
 * from tokens.css, and from the RULES rather than computed style so a Game Boy
 * card shows Game Boy green while the page is painted NES. An inherited entry
 * falls back to `:root`. Empty when the sheet is unreadable (jsdom, or before
 * styles load), which renders no swatches rather than transparent boxes.
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
 * Same sheet walk as the swatches; an inherited entry gets the `:root` one.
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

/** The same five for a custom palette. Pure: a custom theme carries its resolved palette. */
export function swatchesFromPalette(palette: Record<string, string>): string[] {
    const swatches = SWATCH_TOKENS.map((token) => palette[`${PALETTE_PREFIX}${token}`]);
    return swatches.every(Boolean) ? swatches : [];
}

/**
 * Removes every inline `--ms-palette-*` override a custom theme stamped. Walked
 * off the style object, so a palette entry added later cannot be left behind.
 */
function clearCustomPaletteOverrides(): void {
    const style = document.documentElement.style;
    for (let i = style.length - 1; i >= 0; i--) {
        const name = style[i];
        if (name.startsWith(PALETTE_PREFIX)) style.removeProperty(name);
    }
}

/**
 * Applies a theme. Built-in themes are a `data-theme` attribute; custom ones
 * are the palette stamped as inline custom properties. Either path first clears
 * the other's residue.
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
 * The palette currently painted, as the attribute holds it (null for the
 * default and for a custom one). Read rather than derived because the no-flash
 * script, the settings slice, a holiday and /ds all set it; anything following
 * the paint (components/ds/sprites.tsx) follows this.
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
 * A stable cursor colour for a player, as a token reference so a theme switch
 * moves live cursors too (read by board.module.css).
 */
export function cursorColorForId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `var(--ms-palette-cursor-${(Math.abs(hash) % CURSOR_RAMP_SIZE) + 1})`;
}
