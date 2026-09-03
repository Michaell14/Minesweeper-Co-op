import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Client-side unit tests, scoped to the frontend directories so Vitest does
 * not pick up the server's CommonJS Jest specs. Pure logic runs in Node; a
 * component test opts into jsdom with `@vitest-environment jsdom` on its
 * first line. Layout, a running server or two clients belong in the smoke
 * suite (`npm run test:ui`).
 */
export default defineConfig({
    resolve: {
        // Components import through `@/`, which otherwise only tsconfig knows about.
        alias: { "@": path.resolve(__dirname) },
    },
    esbuild: {
        // tsconfig says `jsx: preserve` for Next; the test runner compiles it itself.
        jsx: "automatic",
    },
    test: {
        include: ["{app,components,lib,hooks,state,shared}/**/*.test.{ts,tsx}"],
        setupFiles: ["./test/setup.ts"],
    },
});
