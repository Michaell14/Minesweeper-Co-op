/**
 * The themes the catalog can preview.
 *
 * `id` is the `data-theme` value; `null` is the default palette, which sets no
 * attribute at all. Kept beside the catalog rather than in components/ds
 * because switching themes is a preview affordance, not a design primitive —
 * when the app grows a real theme picker this list moves with it.
 */
export interface ThemeOption {
    id: string | null;
    label: string;
    /** One or two words — this has to fit on a single line inside a card. */
    short: string;
    /** What this palette is for, and what it costs. */
    note: string;
}

export const THEMES: ThemeOption[] = [
    { id: null, label: "NES", short: "Default", note: "The default palette. Full hue range." },
    {
        id: "gameboy",
        label: "Game Boy",
        short: "4 shades",
        note: "Four shades total — the hardest case, and the one that breaks the number colours.",
    },
    {
        id: "c64",
        label: "C64",
        short: "16 colours",
        note: "Sixteen colours, so everything the default palette encodes survives.",
    },
    {
        id: "dark",
        label: "Dark",
        short: "Inverted",
        note: "Not a retro machine — the one people will actually ask for.",
    },
];

/** Applies a theme to the document, or clears it for the default palette. */
export function applyTheme(id: string | null): void {
    if (id) document.documentElement.dataset.theme = id;
    else delete document.documentElement.dataset.theme;
}

const PALETTE_PREFIX = "--ms-palette-";

/** Every palette custom property declared by a selector, read out of the CSSOM. */
function declaredBy(selector: string): string[] {
    const found = new Set<string>();
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
            if (!(rule instanceof CSSStyleRule) || rule.selectorText !== selector) continue;
            for (const prop of Array.from(rule.style)) {
                if (prop.startsWith(PALETTE_PREFIX)) found.add(prop);
            }
        }
    }
    return [...found];
}

export interface ThemeCoverage {
    total: number;
    overridden: number;
    /** Entries the theme leaves to the default palette, without their prefix. */
    inherited: string[];
}

/**
 * Which palette entries a theme actually redefines.
 *
 * Inheriting is legitimate — Dark keeps the NES intent hues on purpose — but
 * "deliberately inherited" and "forgotten" are indistinguishable until someone
 * lists them, and a forgotten entry is exactly how a palette ships half-applied.
 */
export function coverageOf(id: string | null): ThemeCoverage | null {
    if (typeof document === "undefined") return null;
    const base = declaredBy(":root");
    if (base.length === 0) return null;
    if (!id) return { total: base.length, overridden: base.length, inherited: [] };

    const overrides = new Set(declaredBy(`:root[data-theme="${id}"]`));
    const inherited = base
        .filter((prop) => !overrides.has(prop))
        .map((prop) => prop.slice(PALETTE_PREFIX.length))
        .sort();

    return { total: base.length, overridden: base.length - inherited.length, inherited };
}
