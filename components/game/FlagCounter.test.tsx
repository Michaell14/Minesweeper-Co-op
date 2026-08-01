// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import FlagCounter from "./FlagCounter";

/**
 * Mines remaining, in the three places it appears.
 *
 * The number is wrapped in an emoji and a <strong>, so its text content alone
 * reads as "🚩 12" — no use to anyone listening rather than looking. The
 * accessible name is what carries the meaning, and like the timer's it is the
 * kind of thing that can stop resolving while the component still looks right.
 */

describe.each(["panel", "dialog", "hud"] as const)("the %s counter", (variant) => {
    test("announces what the number means, not just the number", () => {
        render(<FlagCounter remainingFlags={12} variant={variant} />);

        expect(screen.getByRole("status", { name: "12 flags remaining" })).toBeDefined();
    });

    test("shows the count on screen too", () => {
        render(<FlagCounter remainingFlags={12} variant={variant} />);

        expect(screen.getByRole("status").textContent).toContain("12");
    });

    /*
     * Over-flagging goes negative rather than clamping at zero — that is the
     * long-standing behaviour, and it is informative: it tells you you have
     * placed more flags than there are mines.
     */
    test("reports over-flagging rather than clamping at zero", () => {
        render(<FlagCounter remainingFlags={-3} variant={variant} />);

        expect(screen.getByRole("status", { name: "-3 flags remaining" })).toBeDefined();
    });
});

describe("what differs between them", () => {
    /* The sticky mobile bar is tight on height, so it drops the panel chrome. */
    test("the hud is bare text, with no panel around it", () => {
        const { container } = render(<FlagCounter remainingFlags={5} variant="hud" />);

        expect(container.querySelector("p")?.parentElement).toBe(container);
    });

    test("the dialog spells out what the number is", () => {
        render(<FlagCounter remainingFlags={5} variant="dialog" />);

        expect(screen.getByRole("status").textContent).toContain("left");
    });

    test("the desktop panel shows the number alone", () => {
        render(<FlagCounter remainingFlags={5} variant="panel" />);

        expect(screen.getByRole("status").textContent).not.toContain("left");
    });
});
