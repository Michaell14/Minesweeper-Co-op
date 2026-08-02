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

const escapeForRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The body of a top-level block, found by brace matching.
 *
 * A regex up to the first `}` would stop inside a nested `@media`, which the
 * root block contains — and would then report most of the file as missing.
 *
 * The selector is matched as a rule HEAD — at the start of a line, followed by
 * its brace — rather than as a substring. `:root` is a prefix of every
 * `:root[data-theme=...]` head and also appears indented inside the `@media`
 * blocks, so a substring search returns whichever comes first in the file. It
 * does today; reordering the file is all it would take to have `:root` quietly
 * return a theme's body instead, and every test below would then be checking
 * that block against itself.
 */
export const blockBody = (selector: string, source = TOKENS) => {
    const head = new RegExp(`^${escapeForRegExp(selector)}\\s*\\{`, "m").exec(source);
    if (!head) throw new Error(`no block for ${selector}`);
    const open = head.index + head[0].length - 1;
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
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

/*
 * The file order this suite reads is not a rule anyone enforces, so the reader
 * must not depend on it. Everything above would still pass if `:root` resolved
 * to a theme's body — it would just be comparing that block against itself.
 */
describe("the block reader finds heads, not substrings", () => {
    const REORDERED = [
        ':root[data-theme="dark"] {',
        "    --ms-palette-themed: #111;",
        "}",
        ":root {",
        "    --ms-palette-root: #fff;",
        "}",
    ].join("\n");

    test(":root is not satisfied by a theme block that precedes it", () => {
        expect(blockBody(":root", REORDERED)).toContain("--ms-palette-root");
        expect(blockBody(":root", REORDERED)).not.toContain("--ms-palette-themed");
    });

    test("a theme selector still finds its own block", () => {
        expect(blockBody(':root[data-theme="dark"]', REORDERED)).toContain("--ms-palette-themed");
    });

    test("an indented nested rule is not mistaken for a top-level block", () => {
        const NESTED = ["@media (foo) {", "    :root {", "        --ms-palette-nested: #000;", "    }", "}", ":root {", "    --ms-palette-real: #fff;", "}"].join("\n");
        expect(blockBody(":root", NESTED)).toContain("--ms-palette-real");
    });

    test("a selector with no block of its own is an error, not an empty pass", () => {
        expect(() => blockBody(':root[data-theme="nope"]', REORDERED)).toThrow(/no block/);
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
