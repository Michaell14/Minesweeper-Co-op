/**
 * Catalog-only theme tooling: what exists to critique a palette rather than use
 * one. The list and applyTheme itself live in lib/theme.ts.
 */
export { THEMES, applyTheme, type ThemeOption } from "@/lib/theme";

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
 * Which palette entries a theme actually redefines. Inheriting is legitimate —
 * Dark keeps the NES intent hues on purpose — but "deliberately inherited" and
 * "forgotten" are indistinguishable until someone lists them, and a forgotten
 * entry is how a palette ships half-applied.
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
