/**
 * Custom palettes: nine core colours, from which the full ~60-entry palette
 * layer is derived. Most built-in entries are functions of a few choices
 * (bevels, intent variants, ink-on-fill), so the editor asks for the choices
 * and computes the rest, which keeps a hand-built theme coherent. Cursor ramp
 * and numbers are derived, not editable: numbers keep their classic colours
 * where they clear 3:1 on the open-cell fill, else degrade to darkness-coding.
 *
 * A theme stores BOTH the core (to re-edit) and the resolved palette (to
 * stamp), so paint time is literal writes. Applied as inline custom properties
 * on :root, since custom themes are not in tokens.css at build time.
 */

import { contrastRatio, type Rgb } from "@/app/ds/contrast";

export interface CustomThemeCore {
    /** Text. */ ink: string;
    /** Page background. */ paper: string;
    /** Panel fill. */ panel: string;
    /** Primary buttons and selection. */ accent: string;
    /** Success intent. */ success: string;
    /** Warning intent. */ warning: string;
    /** Danger intent, and the mine. */ danger: string;
    /** Closed cells. */ cellClosed: string;
    /** Open cells. */ cellOpen: string;
}

export interface CustomTheme {
    /** Slug, unique per player; `custom:<id>` is the settings.theme value. */
    id: string;
    name: string;
    core: CustomThemeCore;
    /** Fully resolved --ms-palette-* map. */
    palette: Record<string, string>;
}

export const CUSTOM_THEME_PREFIX = "custom:";
export const CUSTOM_THEMES_STORAGE_KEY = "minesweeper_custom_themes";
/** Enough for a shelf of experiments; not an unbounded sync payload. */
export const MAX_CUSTOM_THEMES = 20;

export const CORE_FIELDS: { key: keyof CustomThemeCore; label: string; hint: string }[] = [
    { key: "ink", label: "Text", hint: "Body text and headings" },
    { key: "paper", label: "Page", hint: "The page background" },
    { key: "panel", label: "Panels", hint: "Boxes, cards and dialogs" },
    { key: "accent", label: "Accent", hint: "Primary buttons and selection" },
    { key: "success", label: "Success", hint: "Wins and confirmations" },
    { key: "warning", label: "Warning", hint: "Cautions and the banner" },
    { key: "danger", label: "Danger", hint: "Errors, losses and mines" },
    { key: "cellClosed", label: "Closed cells", hint: "The unopened board" },
    { key: "cellOpen", label: "Open cells", hint: "Revealed ground" },
];

// --- Colour maths (hex in, hex out) ------------------------------------------

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const isHexColor = (value: unknown): value is string =>
    typeof value === "string" && HEX_RE.test(value);

export const hexToRgb = (hex: string): Rgb => {
    const h = hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    return [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
    ];
};

const rgbToHex = ([r, g, b]: Rgb): string =>
    `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;

/** Linear blend, t of the way from a to b. */
export const mix = (a: string, b: string, t: number): string => {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
};

export const hexContrast = (a: string, b: string): number =>
    contrastRatio(hexToRgb(a), hexToRgb(b));

/** Whichever of black/white reads better on the fill. */
const inkOn = (fill: string): string =>
    hexContrast("#111111", fill) >= hexContrast("#ffffff", fill) ? "#111111" : "#ffffff";

// --- Palette derivation ------------------------------------------------------

/** The classic number colours, kept per-number where they stay legible. */
const CLASSIC_NUMS = [
    "#0000ff", "#007d00", "#d70000", "#000080",
    "#800000", "#007777", "#000000", "#6a6a6a",
];

/** One intent family (blue/green/yellow/red) from its base colour. */
const family = (name: string, base: string, paper: string): Record<string, string> => ({
    [`--ms-palette-${name}`]: base,
    [`--ms-palette-${name}-deep`]: mix(base, "#ffffff", 0.18),
    [`--ms-palette-${name}-shade`]: mix(base, "#000000", 0.32),
    [`--ms-palette-${name}-ink`]: inkOn(base),
    [`--ms-palette-${name}-alt`]: base,
    // Used as text on paper: darken/lighten toward legibility if needed.
    [`--ms-palette-${name}-text`]:
        hexContrast(base, paper) >= 3 ? base : mix(base, inkOn(paper), 0.45),
});

/** The full palette layer from nine choices: the complete set the no-flash script and applyThemeChoice stamp. */
export function derivePalette(core: CustomThemeCore): Record<string, string> {
    const { ink, paper, panel, accent, success, warning, danger, cellClosed, cellOpen } = core;

    const numbers: Record<string, string> = {};
    CLASSIC_NUMS.forEach((classic, i) => {
        // Classic hue where it reads on this fill; otherwise darkness (1-3 mid, 4-8 full).
        numbers[`--ms-palette-num-${i + 1}`] =
            hexContrast(classic, cellOpen) >= 3
                ? classic
                : mix(inkOn(cellOpen), cellOpen, i < 3 ? 0.25 : 0);
    });

    return {
        "--ms-palette-ink": ink,
        "--ms-palette-paper": paper,
        "--ms-palette-smoke": panel,
        "--ms-palette-ash": mix(panel, ink, 0.12),
        "--ms-palette-steel": mix(panel, ink, 0.35),
        "--ms-palette-gray": mix(ink, paper, 0.25),
        "--ms-palette-gray-dark": mix(ink, paper, 0.12),
        "--ms-palette-track": mix(panel, ink, 0.2),
        "--ms-palette-mist": mix(panel, paper, 0.5),
        "--ms-palette-mist-deep": mix(panel, ink, 0.15),
        "--ms-palette-chrome": mix(panel, ink, 0.08),

        ...family("blue", accent, paper),
        ...family("green", success, paper),
        ...family("yellow", warning, paper),
        ...family("red", danger, paper),
        "--ms-palette-orange-alt": mix(warning, danger, 0.5),
        "--ms-palette-amber": warning,
        "--ms-palette-amber-ink": inkOn(warning),

        "--ms-palette-cell-closed": cellClosed,
        "--ms-palette-cell-light": mix(cellClosed, "#ffffff", 0.4),
        "--ms-palette-cell-shade": mix(cellClosed, "#000000", 0.35),
        "--ms-palette-cell-open": cellOpen,
        "--ms-palette-gutter": ink,
        "--ms-palette-mine": danger,

        "--ms-palette-cursor-ink": inkOn(mix(accent, paper, 0.5)),
        "--ms-palette-cursor-1": mix(accent, paper, 0.45),
        "--ms-palette-cursor-2": mix(success, paper, 0.45),
        "--ms-palette-cursor-3": mix(warning, paper, 0.45),
        "--ms-palette-cursor-4": mix(danger, paper, 0.45),
        "--ms-palette-cursor-5": mix(accent, success, 0.5),
        "--ms-palette-cursor-6": mix(warning, danger, 0.5),

        ...numbers,
    };
}

// --- Validation and storage --------------------------------------------------

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const MAX_THEME_NAME_LENGTH = 24;

export const isCustomThemeSetting = (theme: string | null): theme is string =>
    typeof theme === "string" && theme.startsWith(CUSTOM_THEME_PREFIX);

/** A valid theme from untrusted input (storage or server), or null. */
export function sanitizeCustomTheme(raw: unknown): CustomTheme | null {
    if (typeof raw !== "object" || raw === null) return null;
    const { id, name, core } = raw as Record<string, unknown>;
    if (typeof id !== "string" || !ID_RE.test(id)) return null;
    if (typeof name !== "string" || name.trim() === "" || name.length > MAX_THEME_NAME_LENGTH) return null;

    if (typeof core !== "object" || core === null) return null;
    const coreOut = {} as CustomThemeCore;
    for (const { key } of CORE_FIELDS) {
        const value = (core as Record<string, unknown>)[key];
        if (!isHexColor(value)) return null;
        coreOut[key] = value.toLowerCase();
    }

    // Always re-derived from the core, never trusted: a hand-edited blob cannot
    // smuggle property names into style attributes, and stored palettes cannot drift.
    return { id, name: name.trim(), core: coreOut, palette: derivePalette(coreOut) };
}

/** Every stored theme, invalid entries dropped. Storage is untrusted input. */
export function readCustomThemes(): CustomTheme[] {
    if (typeof window === "undefined") return [];
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    } catch {
        return [];
    }
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const seen = new Set<string>();
        const out: CustomTheme[] = [];
        for (const entry of parsed) {
            const theme = sanitizeCustomTheme(entry);
            if (theme && !seen.has(theme.id) && out.length < MAX_CUSTOM_THEMES) {
                seen.add(theme.id);
                out.push(theme);
            }
        }
        return out;
    } catch {
        return [];
    }
}

export function writeCustomThemes(themes: CustomTheme[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            CUSTOM_THEMES_STORAGE_KEY,
            JSON.stringify(themes.slice(0, MAX_CUSTOM_THEMES)),
        );
    } catch {
        // Full or blocked; the shelf holds for this page only.
    }
}

// --- Pending deletions (tombstones) ------------------------------------------

/**
 * Ids deleted locally whose server delete is not yet CONFIRMED. Without them an
 * offline delete is resurrected by the next sign-in merge (server wins on id).
 * Replayed until a delete lands; saving under the id again clears it.
 */
export const PENDING_THEME_DELETIONS_KEY = "minesweeper_theme_deletions";

export function readPendingThemeDeletions(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(PENDING_THEME_DELETIONS_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && ID_RE.test(id)) : [];
    } catch {
        return [];
    }
}

const writePendingThemeDeletions = (ids: string[]): void => {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(PENDING_THEME_DELETIONS_KEY, JSON.stringify(ids));
    } catch {
        // Blocked storage: the delete still happened locally; only the replay is lost.
    }
};

export function addPendingThemeDeletion(id: string): void {
    const ids = readPendingThemeDeletions();
    if (!ids.includes(id)) writePendingThemeDeletions([...ids, id]);
}

export function clearPendingThemeDeletion(id: string): void {
    writePendingThemeDeletions(readPendingThemeDeletions().filter((x) => x !== id));
}

/** A fresh, collision-free id from a name. */
export function mintThemeId(name: string, taken: Set<string>): string {
    const base =
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20) ||
        "theme";
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    return id;
}
