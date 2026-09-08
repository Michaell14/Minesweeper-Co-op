// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import FlagCounter from "./FlagCounter";

/**
 * Mines remaining, in its three places. The text content reads as "🚩 12", so
 * the accessible name carries the meaning, and it can stop resolving while the
 * component still looks right.
 */

describe.each(["bar", "dialog", "hud"] as const)("the %s counter", (variant) => {
    test("announces what the number means, not just the number", () => {
        render(<FlagCounter remainingFlags={12} variant={variant} />);

        expect(screen.getByRole("status", { name: "12 flags remaining" })).toBeDefined();
    });

    test("shows the count on screen too", () => {
        render(<FlagCounter remainingFlags={12} variant={variant} />);

        expect(screen.getByRole("status").textContent).toContain("12");
    });

    /* Over-flagging goes negative rather than clamping: it says you placed more flags than mines. */
    test("reports over-flagging rather than clamping at zero", () => {
        render(<FlagCounter remainingFlags={-3} variant={variant} />);

        expect(screen.getByRole("status", { name: "-3 flags remaining" })).toBeDefined();
    });
});

describe("what differs between them", () => {
    /* Both bars sit on a board that is already framed. */
    test.each(["hud", "bar"] as const)("the %s is bare text, with no panel around it", (variant) => {
        const { container } = render(<FlagCounter remainingFlags={5} variant={variant} />);

        expect(container.querySelector("p")?.parentElement).toBe(container);
    });

    test("the dialog spells out what the number is", () => {
        render(<FlagCounter remainingFlags={5} variant="dialog" />);

        expect(screen.getByRole("status").textContent).toContain("left");
    });

    /* Beside a flag sprite on the board, "left" is noise; in a dialog it is not. */
    test("the desktop bar shows the number alone", () => {
        render(<FlagCounter remainingFlags={5} variant="bar" />);

        expect(screen.getByRole("status").textContent).not.toContain("left");
    });
});
