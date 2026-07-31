import { defineConfig } from "vitest/config";

/**
 * Client-side unit tests.
 *
 * Scoped explicitly to the frontend directories: the server has its own Jest
 * suite under server/tests/, and Vitest's default glob would otherwise pick
 * those up and run CommonJS Jest specs it cannot understand.
 *
 * For anything that needs a browser, use the smoke suite (`npm run test:ui`) —
 * this runner is for pure logic only, so it stays fast and needs no DOM.
 */
export default defineConfig({
    test: {
        include: ["{app,components,lib,hooks,state,shared}/**/*.test.{ts,tsx}"],
    },
});
