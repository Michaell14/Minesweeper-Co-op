// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import Timer from "./Timer";

/**
 * The run clock as a screen reader hears it. The digits are `aria-hidden`
 * (they change every second), so the accessible name carries the reading, and
 * an `aria-label` on a generic element is ignored: without `role="timer"` the
 * timer announces nothing while looking correct. `getByRole('timer', { name })`
 * fails both when the role goes and when the name stops resolving.
 */

const setClock = (startedAt: number | null, endedAt: number | null) =>
    useMinesweeperStore.getState().setClock({ startedAt, endedAt });

beforeEach(() => {
    vi.useFakeTimers();
    // A fixed "now" so elapsed time is arithmetic rather than a race.
    vi.setSystemTime(new Date("2026-08-01T12:00:00Z"));
});

afterEach(() => {
    vi.useRealTimers();
    setClock(null, null);
});

const now = () => Date.now();

describe.each(["hud", "bar"] as const)("the %s timer", (variant) => {
    test("is reachable as a timer, not just as text on screen", () => {
        setClock(now() - 5_000, null);
        render(<Timer variant={variant} />);

        expect(screen.getByRole("timer", { name: "Elapsed time 00:05" })).toBeDefined();
    });

    test("says so when the clock has not started", () => {
        setClock(null, null);
        render(<Timer variant={variant} />);

        expect(screen.getByRole("timer", { name: "Timer not started" })).toBeDefined();
    });

    /* The visible digits are decoration; the name is the information. */
    test("hides the digits from assistive tech so it does not narrate every second", () => {
        setClock(now() - 5_000, null);
        const { container } = render(<Timer variant={variant} />);

        expect(container.querySelector("[aria-hidden='true']")?.textContent).toContain("00:05");
    });
});

describe("counting", () => {
    test("shows zero before the first reveal", () => {
        setClock(null, null);
        render(<Timer variant="hud" />);

        expect(screen.getByRole("timer").textContent).toContain("00:00");
    });

    test("picks up a run already in progress rather than starting at zero", () => {
        // What a late joiner or a reload gets: a start well in the past.
        setClock(now() - 95_000, null);
        render(<Timer variant="hud" />);

        expect(screen.getByRole("timer").textContent).toContain("01:35");
    });

    test("ticks while the game is running", () => {
        setClock(now(), null);
        render(<Timer variant="hud" />);

        // act() so React flushes the interval's state update.
        act(() => vi.advanceTimersByTime(3_000));

        expect(screen.getByRole("timer").textContent).toContain("00:03");
    });

    test("freezes once the game ends", () => {
        const started = now() - 10_000;
        setClock(started, started + 7_000);
        render(<Timer variant="hud" />);

        act(() => vi.advanceTimersByTime(5_000));

        expect(screen.getByRole("timer").textContent).toContain("00:07");
    });

    /*
     * A finished or unstarted clock must not leave an interval running: the
     * board remounts these on every reset, and a leak is invisible for a while.
     */
    test("schedules nothing when there is nothing to count", () => {
        setClock(null, null);
        render(<Timer variant="hud" />);

        expect(vi.getTimerCount()).toBe(0);
    });

    test("schedules nothing after the game has ended", () => {
        setClock(now() - 10_000, now());
        render(<Timer variant="hud" />);

        expect(vi.getTimerCount()).toBe(0);
    });

    test("stops counting when it leaves the screen", () => {
        setClock(now(), null);
        const { unmount } = render(<Timer variant="hud" />);
        expect(vi.getTimerCount()).toBe(1);

        unmount();

        expect(vi.getTimerCount()).toBe(0);
    });
});

describe("formatting", () => {
    test("stays mm:ss for a run under an hour", () => {
        setClock(now() - 3_599_000, null);
        render(<Timer variant="hud" />);

        expect(screen.getByRole("timer").textContent).toContain("59:59");
    });

    /* Wrapping back to 00:00 would quietly under-report a very long game. */
    test("widens rather than wrapping once a run passes an hour", () => {
        setClock(now() - 3_661_000, null);
        render(<Timer variant="hud" />);

        expect(screen.getByRole("timer").textContent).toContain("1:01:01");
    });
});
