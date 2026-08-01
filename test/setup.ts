import { afterEach } from "vitest";

/**
 * Shared setup for the client suite.
 *
 * This file is loaded for EVERY test, including the pure-logic ones that run in
 * Node with no DOM, so everything here has to be safe without one — hence the
 * `document` check rather than an unconditional import of the DOM helpers.
 */

/*
 * Unmount whatever the last test rendered.
 *
 * Testing Library only auto-cleans when a global `afterEach` is available at
 * import time, which is not guaranteed under every Vitest config. Doing it
 * explicitly means a leaked component cannot make the next test's `getByRole`
 * find two matches — a failure that reads as "ambiguous query" and points
 * nowhere near the test that actually caused it.
 */
afterEach(async () => {
    if (typeof document === "undefined") return;
    const { cleanup } = await import("@testing-library/react");
    cleanup();
});
