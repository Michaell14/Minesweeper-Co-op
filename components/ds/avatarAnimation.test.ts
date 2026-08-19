/**
 * The seam between the art and its timing.
 *
 * A hover frame is drawn by avatarArt.ts but told WHEN to show by
 * Avatar.module.css, and neither half can see the other: a frame with no
 * keyframes never appears, and keyframes with no frame animate nothing. Both
 * fail in the one way nothing else here catches — silently, on one face, only
 * while the pointer is on it.
 *
 * So this parses the stylesheet the way app/tokens.test.ts parses tokens.css.
 * It says nothing about whether the motion looks right; that is what /ds is for.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AVATAR_ART, AVATAR_HOVER_FRAMES } from "./avatarArt";

const css = readFileSync(join(__dirname, "Avatar.module.css"), "utf8");

/** The declarations inside `.animated[data-avatar="id"] { ... }`. */
const blockFor = (id: string): string =>
    css.match(new RegExp(`\\[data-avatar="${id}"\\]\\s*\\{([^}]*)\\}`))?.[1] ?? "";

/** The keyframes an avatar names, by frame index: { 1: "frogRest", ... }. */
const framesNamedBy = (id: string): Record<number, string> =>
    Object.fromEntries(
        [
            ...css.matchAll(
                new RegExp(
                    `\\[data-avatar="${id}"\\]:hover\\s+\\.frame:nth-of-type\\((\\d+)\\)\\s*\\{\\s*animation-name:\\s*([\\w-]+)`,
                    "g",
                ),
            ),
        ].map((m) => [Number(m[1]), m[2]]),
    );

// The brace matters: the prose above mentions @keyframes too.
const definedKeyframes = new Set(
    [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((m) => m[1]),
);

/**
 * A keyframes body, by brace matching rather than by regex: the blocks nest,
 * and a pattern that stops at the first `}` reads half a rule as the whole.
 */
const bodyOf = (name: string): string => {
    const at = css.search(new RegExp(`@keyframes\\s+${name}\\s*\\{`));
    if (at < 0) return "";
    const from = css.indexOf("{", at);
    let depth = 0;
    for (let i = from; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}" && --depth === 0) return css.slice(from + 1, i);
    }
    return "";
};

/** The opacity stops of one keyframes, in cycle order. */
const stopsOf = (name: string): Array<{ at: number; opacity: number }> =>
    [...bodyOf(name).matchAll(/(\d+)%\s*\{\s*opacity:\s*([\d.]+)/g)]
        .map((m) => ({ at: Number(m[1]), opacity: Number(m[2]) }))
        .sort((a, b) => a.at - b.at);

/**
 * What a frame's opacity is at a point in the cycle. `steps(1, end)` holds the
 * value of the stop it is on until the next one, so this is a lookup, not an
 * interpolation — which is the only reason a static check can answer it.
 */
const opacityAt = (stops: Array<{ at: number; opacity: number }>, t: number): number =>
    stops.reduce((held, stop) => (stop.at <= t ? stop.opacity : held), 0);

const animated = Object.keys(AVATAR_HOVER_FRAMES);

describe("every drawn frame has timing", () => {
    it.each(animated)("%s names one keyframes per frame, base included", (id) => {
        const named = framesNamedBy(id);
        const expected = 1 + AVATAR_HOVER_FRAMES[id].length;
        expect(Object.keys(named).map(Number).sort((a, b) => a - b)).toEqual(
            Array.from({ length: expected }, (_, i) => i + 1),
        );
    });

    it.each(animated)("%s names keyframes that exist", (id) => {
        for (const name of Object.values(framesNamedBy(id))) {
            expect(definedKeyframes.has(name), `@keyframes ${name} is missing`).toBe(true);
        }
    });

    it.each(animated)("%s sets a cycle length off the duration token", (id) => {
        expect(blockFor(id)).toMatch(/--cycle:.*var\(--ms-duration-loop\)/);
    });

    // Naming a keyframes does nothing on its own: one shared rule supplies the
    // duration, the step function and the repeat to every frame there is.
    it("drives them from the shared rule", () => {
        const shared = css.match(/\.animated:hover \.frame\s*\{([^}]*)\}/)?.[1] ?? "";
        expect(shared).toMatch(/animation-duration:\s*var\(--cycle\)/);
        expect(shared).toMatch(/animation-timing-function:\s*steps\(1, end\)/);
        expect(shared).toMatch(/animation-iteration-count:\s*infinite/);
    });
});

/**
 * The invariant the whole flipbook rests on. These are opaque portraits stacked
 * on each other, so two lit at once is not a blend, it is a mess — and none lit
 * is a hole where the avatar was. The browser check in scripts/ui-smoke samples
 * this at a handful of moments; reading the stops proves it for every moment,
 * which is the difference between "did not overlap when we looked" and "cannot".
 */
describe("exactly one frame is lit, all the way round", () => {
    it.each(animated)("%s", (id) => {
        const tracks = Object.entries(framesNamedBy(id))
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, name]) => stopsOf(name));

        for (const [i, stops] of tracks.entries()) {
            expect(stops.length, `frame ${i + 1} of ${id} has no opacity stops`).toBeGreaterThan(0);
            // Without a 0% stop the first slice of the cycle has no stated
            // value, and the pose that shows there is the browser's guess.
            expect(stops[0].at, `frame ${i + 1} of ${id} does not start at 0%`).toBe(0);
        }

        // Values only change at a stop, so every stop is a point worth asking
        // about and no point between two of them can differ from its start.
        const moments = [...new Set(tracks.flatMap((stops) => stops.map((s) => s.at)))].sort(
            (a, b) => a - b,
        );
        for (const t of moments) {
            const lit = tracks.filter((stops) => opacityAt(stops, t) === 1).length;
            expect(lit, `${id} shows ${lit} frames at ${t}% of its cycle`).toBe(1);
        }
    });
});

describe("no timing without art", () => {
    it("styles no avatar that does not exist", () => {
        for (const [, id] of css.matchAll(/\[data-avatar="([\w-]+)"\]/g)) {
            expect(AVATAR_ART[id], `${id} is styled but has no art`).toBeDefined();
        }
    });

    it("names no keyframes nothing plays", () => {
        const used = new Set(animated.flatMap((id) => Object.values(framesNamedBy(id))));
        for (const name of definedKeyframes) {
            expect(used.has(name), `@keyframes ${name} is unused`).toBe(true);
        }
    });
});
