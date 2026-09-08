import { afterEach } from "vitest";

/**
 * Shared setup for the client suite. Loaded for every test, including the
 * pure-logic ones with no DOM, hence the `document` check.
 */

/*
 * Unmount whatever the last test rendered. Testing Library's auto-cleanup is
 * not guaranteed under every Vitest config, and a leaked component makes the
 * next test's `getByRole` ambiguous.
 */
afterEach(async () => {
    if (typeof document === "undefined") return;
    const { cleanup } = await import("@testing-library/react");
    cleanup();
});
