import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The token file, checked against itself.
 *
 * CSS has no error for any of this. A `var()` pointing at a name that does not
 * exist resolves to nothing and the element renders with an inherited or
 * initial value; a theme that forgets a palette entry silently keeps the
 * default one. Both look like a styling opinion rather than a bug, and neither
 * `tsc`, the linter nor the build says a word.
 *
 * That is the whole reason to parse the file. The contrast audit at `/ds`
 * measures pairs someone remembered to list; this covers every token there is,
 * and it costs nothing at runtime because it never opens a browser.
 */

/*
 * Comments are stripped first. This file explains itself heavily, and a comment
 * like "Thinner than --ms-border-width: a 4px bevel..." parses as a declaration
 * otherwise — which reported a duplicate that does not exist.
 */
const TOKENS = readFileSync(join(__dirname, "tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** `--ms-foo: value;` declarations inside one block, in source order. */
const declarationsIn = (block: string) =>
    [...block.matchAll(/(--ms-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => ({
        name: m[1],
        value: m[2].trim(),
    }));

/**
 * The body of a top-level block, found by brace matching.
 *
 * A regex up to the first `}` would stop inside a nested `@media`, which the
 * root block contains — and would then report most of the file as missing.
 */
const blockBody = (selector: string) => {
    const start = TOKENS.indexOf(selector);
    if (start === -1) throw new Error(`no block for ${selector}`);
    const open = TOKENS.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < TOKENS.length; i++) {
        if (TOKENS[i] === "{") depth++;
        if (TOKENS[i] === "}" && --depth === 0) return TOKENS.slice(open + 1, i);
    }
    throw new Error(`unbalanced braces after ${selector}`);
};

const THEME_SELECTORS = [
    ':root[data-theme="gameboy"]',
    ':root[data-theme="c64"]',
    ':root[data-theme="dark"]',
];

const rootDeclarations = declarationsIn(blockBody(":root"));
const rootNames = new Set(rootDeclarations.map((d) => d.name));
const paletteNames = [...rootNames].filter((n) => n.startsWith("--ms-palette-"));

describe("every token resolves to something", () => {
    /*
     * The silent one. `var(--ms-intnet-primary)` is a typo CSS accepts: the
     * declaration is valid, the reference resolves to nothing, and the element
     * falls back to whatever it inherited.
     */
    test("no var() points at a name that does not exist", () => {
        const dangling: string[] = [];
        for (const { name, value } of rootDeclarations) {
            for (const [, ref] of value.matchAll(/var\((--ms-[\w-]+)/g)) {
                if (!rootNames.has(ref)) dangling.push(`${name} -> ${ref}`);
            }
        }
        expect(dangling).toEqual([]);
    });

    test("nothing is declared twice in the same block, where the later wins silently", () => {
        const seen = new Set<string>();
        const duplicates: string[] = [];
        for (const { name } of rootDeclarations) {
            if (seen.has(name)) duplicates.push(name);
            seen.add(name);
        }
        expect(duplicates).toEqual([]);
    });

    test("the palette is actually the bulk of it, so this is checking the real file", () => {
        expect(paletteNames.length).toBeGreaterThan(50);
    });
});

describe("a theme changes everything or nothing", () => {
    /*
     * NOT "overrides every palette token" — `dark` deliberately keeps the NES
     * accent hues and changes only the neutrals, which is what most dark modes
     * do. What matters is not that a theme overrides everything, but that
     * whatever it leaves behind still passes contrast against the surfaces it
     * DID change. That is checked against a real browser, across every theme,
     * in scripts/ui-smoke — it needs resolved colours, which only a renderer
     * has.
     */

    /*
     * And the other direction: a theme entry for a name the root does not
     * declare is dead weight. It usually means a token was renamed in :root and
     * the themes were not, so the theme is now overriding nothing at all.
     */
    test.each(THEME_SELECTORS)("%s overrides nothing that no longer exists", (selector) => {
        const themed = declarationsIn(blockBody(selector)).map((d) => d.name);
        const orphans = themed.filter((n) => !rootNames.has(n));
        expect(orphans).toEqual([]);
    });

    /*
     * Themes must not reach past the palette. Overriding a semantic token
     * directly is how a palette stops being the single lever: the theme starts
     * carrying its own opinion about what "primary" means, and the next
     * component that reads the palette directly disagrees with it.
     */
    test.each(THEME_SELECTORS)("%s touches only the palette layer", (selector) => {
        const themed = declarationsIn(blockBody(selector)).map((d) => d.name);
        const beyond = themed.filter((n) => !n.startsWith("--ms-palette-"));
        expect(beyond).toEqual([]);
    });
});

describe("the semantic layer stays derived", () => {
    /*
     * A semantic token holding a literal colour is invisible to a theme: it
     * cannot move, because there is no palette entry behind it to change. This
     * is the same bug as a hardcoded colour in a component, one level up and
     * harder to spot.
     */
    test("no semantic colour token hardcodes a literal", () => {
        const COLOUR_GROUPS = ["intent", "surface", "ink", "border", "cell", "num", "status", "progress"];
        const literals = rootDeclarations
            .filter(({ name }) => COLOUR_GROUPS.some((g) => name.startsWith(`--ms-${g}-`)))
            .filter(({ value }) => /^#|^rgb|^hsl/.test(value))
            .map(({ name, value }) => `${name}: ${value}`);
        expect(literals).toEqual([]);
    });
});
