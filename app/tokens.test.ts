import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VALID_THEME_IDS } from "@/lib/theme";
import { AA_NORMAL, contrastRatio, type Rgb } from "@/app/ds/contrast";

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

/* Read out of the file: a hand-kept list stops covering whatever it missed. */
const THEME_SELECTORS = [...TOKENS.matchAll(/^:root\[data-theme="([\w-]+)"\]\s*\{/gm)].map(
    (m) => `:root[data-theme="${m[1]}"]`,
);

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

/* A card with no block paints the DEFAULT palette while claiming to be chosen. */
describe("every palette is both defined and offered", () => {
    const inCss = new Set(
        THEME_SELECTORS.map((s) => /data-theme="([\w-]+)"/.exec(s)![1]),
    );
    const inPicker = new Set(VALID_THEME_IDS);

    test("every theme block has a card", () => {
        expect([...inCss].filter((id) => !inPicker.has(id))).toEqual([]);
    });

    test("every card has a theme block", () => {
        expect([...inPicker].filter((id) => !inCss.has(id))).toEqual([]);
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

/*
 * Every palette entry is a colour the browser will actually accept.
 *
 * CSS discards a malformed custom property value at computed-value time and
 * the element falls back to whatever it inherited, so `#24001 2` — a real typo
 * of mine, with a space in it — renders as *something* and says nothing. Worse,
 * a hand-rolled contrast checker will happily parse it: `parseInt('1 ', 16)` is
 * 1, so it scores a plausible ratio for a value that never painted.
 */
describe("palette values are colours", () => {
    const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

    test.each([":root", ...THEME_SELECTORS])("%s declares only valid hex", (selector) => {
        const malformed = declarationsIn(blockBody(selector))
            .filter(({ name }) => name.startsWith("--ms-palette-"))
            .filter(({ value }) => !HEX.test(value))
            .map(({ name, value }) => `${name}: ${value}`);
        expect(malformed).toEqual([]);
    });
});

/*
 * Board legibility — the relationships `AUDITED_PAIRS` does not cover.
 *
 * That list is about text on surfaces, so it never looks at the board: whether
 * the mine cell stands out from a revealed one, whether the closed-cell bevel
 * is visible at all, whether a player's name reads on their cursor colour. All
 * of it is palette arithmetic, so it belongs here rather than in a browser.
 *
 * Thresholds are calibrated against the DEFAULT palette, which is the design's
 * own reference — a bar the reference fails is a bar someone invented. The
 * bevel bar started at 1.4 for that reason and came down: the default's
 * highlight edge is 1.39.
 */
describe("the board stays legible", () => {
    const toRgb = (hex: string): Rgb => {
        const h = hex.length === 4
            ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
            : hex;
        return [
            parseInt(h.slice(1, 3), 16),
            parseInt(h.slice(3, 5), 16),
            parseInt(h.slice(5, 7), 16),
        ] as const;
    };

    /** WCAG 1.4.11: graphical objects and UI components. */
    const NON_TEXT = 3;
    /** A 3px bevel edge is neither, and the default palette sits at 1.39. */
    const BEVEL = 1.15;

    const paletteOf = (selector: string) => {
        const base = Object.fromEntries(
            declarationsIn(blockBody(":root"))
                .filter(({ name }) => name.startsWith("--ms-palette-"))
                .map(({ name, value }) => [name, value]),
        );
        const overrides = selector === ":root"
            ? {}
            : Object.fromEntries(
                  declarationsIn(blockBody(selector))
                      .filter(({ name }) => name.startsWith("--ms-palette-"))
                      .map(({ name, value }) => [name, value]),
              );
        return (token: string) => toRgb(overrides[`--ms-palette-${token}`] ?? base[`--ms-palette-${token}`]);
    };

    /*
     * Palettes that cannot meet a bar and still be what they are, exactly like
     * KNOWN_CONTRAST_FAILURES in the smoke suite. Game Boy has four shades and
     * six cursors, so two of them repeat and no ink reads on both.
     */
    const KNOWN: Record<string, string[]> = {
        // The mine cell is marked by a glyph as well as a fill, and the DEFAULT
        // palette sits at 2.68 — so 3:1 here is the goal, not the design's
        // standard. Listed rather than dialled down, so the gap stays visible.
        ":root": ["mine cell vs open cell"],
        ':root[data-theme="c64"]': ["mine cell vs open cell"],
        // Four shades and six cursors: two repeat, and no ink reads on both.
        ':root[data-theme="gameboy"]': ["cursor 3 label", "cursor 6 label"],
        ':root[data-theme="tetris"]': ["cursor 3 label", "cursor 6 label"],
        ':root[data-theme="mario"]': ["cursor 1 label"],
    };

    test.each([":root", ...THEME_SELECTORS])("%s", (selector) => {
        const p = paletteOf(selector);
        const checks: [string, Rgb, Rgb, number][] = [
            ["mine cell vs open cell", p("mine"), p("cell-open"), NON_TEXT],
            ["bevel highlight", p("cell-light"), p("cell-closed"), BEVEL],
            ["bevel shadow", p("cell-shade"), p("cell-closed"), BEVEL],
            ...([1, 2, 3, 4, 5, 6].map((i) => [
                `cursor ${i} label`,
                p("cursor-ink"),
                p(`cursor-${i}`),
                AA_NORMAL,
            ]) as [string, Rgb, Rgb, number][]),
        ];

        const failing = checks
            .filter(([, a, b, min]) => contrastRatio(a, b) < min)
            .map(([label]) => label);

        const known = KNOWN[selector] ?? [];
        expect(failing.filter((f) => !known.includes(f))).toEqual([]);
    });

    /* Fixing one should delete its entry, not leave a stale exemption behind. */
    test("no palette is exempted from something it now passes", () => {
        for (const [selector, labels] of Object.entries(KNOWN)) {
            const p = paletteOf(selector);
            const stillFailing = labels.filter((label) => {
                if (label === "mine cell vs open cell") {
                    return contrastRatio(p("mine"), p("cell-open")) < NON_TEXT;
                }
                const i = Number(label.match(/\d+/)![0]);
                return contrastRatio(p("cursor-ink"), p(`cursor-${i}`)) < AA_NORMAL;
            });
            expect({ [selector]: stillFailing }).toEqual({ [selector]: labels });
        }
    });
});
