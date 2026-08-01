import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Client-side unit tests.
 *
 * Scoped explicitly to the frontend directories: the server has its own Jest
 * suite under server/tests/, and Vitest's default glob would otherwise pick
 * those up and run CommonJS Jest specs it cannot understand.
 *
 * Two kinds of test live here, told apart per FILE rather than by directory.
 * Pure logic runs in Node and needs nothing. A test that renders a component
 * opts into a DOM with `@vitest-environment jsdom` on its first line, so the
 * fast majority never pays for one and every file states what it needs.
 *
 * Anything needing a real browser — layout, a running server, two clients —
 * still belongs in the smoke suite (`npm run test:ui`). jsdom has no layout
 * engine, so it can tell you a control is unreachable by name but never that it
 * is off-screen.
 */
export default defineConfig({
    resolve: {
        // Components import through `@/`, which otherwise only tsconfig knows about.
        alias: { "@": path.resolve(__dirname) },
    },
    esbuild: {
        // tsconfig says `jsx: preserve` because Next compiles the app; the test
        // runner compiles it itself and has to be told to use the modern runtime.
        jsx: "automatic",
    },
    test: {
        include: ["{app,components,lib,hooks,state,shared}/**/*.test.{ts,tsx}"],
        setupFiles: ["./test/setup.ts"],
    },
});
