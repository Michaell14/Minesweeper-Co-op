import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * What ships on which route, checked from source. None of these fail loudly:
 * break one and the build, the types and every other test stay green while
 * each visitor quietly downloads more. The root layout is the sharp edge, since
 * whatever it reaches statically loads on EVERY route.
 */

const ROOT = join(__dirname, "..");
const CLIENT_DIRS = ["app", "components", "hooks", "lib", "state", "shared"];

const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
    });

/** Client source, tests excluded: a test importing anything ships nothing. */
const SOURCES = CLIENT_DIRS.flatMap((dir) => walk(join(ROOT, dir)))
    .filter((path) => /\.(ts|tsx|js)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))
    .map((path) => ({ file: relative(ROOT, path), text: readFileSync(path, "utf8") }));

const source = (file: string) => {
    const found = SOURCES.find((s) => s.file === file);
    if (!found) throw new Error(`${file} is gone; update this test with wherever it went`);
    return found.text;
};

/** Specifiers a module loads up front. `import type` is erased and `import()` is lazy, so neither counts. */
const staticImports = (text: string) =>
    [...text.matchAll(/^\s*import\s+(?!type\b)(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/gm)].map((m) => m[1]);

const importersOf = (specifier: string) =>
    SOURCES.filter((s) => staticImports(s.text).includes(specifier)).map((s) => s.file);

describe("the socket client stays on the game routes", () => {
    test("the backend URL module imports nothing", () => {
        // The REST clients read it from every route; one import here and they carry it too.
        expect(staticImports(source("lib/serverUrl.ts"))).toEqual([]);
    });

    test("only the socket factory imports socket.io", () => {
        expect(importersOf("socket.io-client")).toEqual(["lib/initSocket.ts"]);
    });

    test("only the socket hook loads the factory", () => {
        // Anything else wanting the URL takes it from lib/serverUrl.ts; types are free.
        expect(importersOf("@/lib/initSocket")).toEqual(["hooks/useSocket.ts"]);
    });
});

describe("what loads only when it is used", () => {
    test("canvas-confetti is fetched on the first burst, not with the page", () => {
        expect(importersOf("canvas-confetti")).toEqual([]);
        expect(source("lib/confetti.ts")).toMatch(/import\([^)]*["']canvas-confetti["']\)/);
    });

    test("the root layout leaves the toasts to components/Toasts.tsx", () => {
        const layout = staticImports(source("app/layout.tsx"));
        expect(layout).not.toContain("@/components/AchievementToast");
        expect(layout).not.toContain("@/components/FriendInviteToast");
        expect(importersOf("@/components/AchievementToast")).toEqual([]);
        expect(importersOf("@/components/FriendInviteToast")).toEqual([]);
    });

    test("Inter is declared once, beside the prose shell, never in the layout", () => {
        // Declared in the root layout, next/font preloads it on every route,
        // including the game, which never sets a line of it.
        const declaring = SOURCES.filter((s) => s.text.includes("@fontsource-variable/inter")).map((s) => s.file);
        expect(declaring).toEqual(["components/marketing/proseFont.ts"]);
    });
});
