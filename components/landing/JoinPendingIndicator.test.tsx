// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import type { JoinPending } from "@/state/connectionSlice";
import JoinPendingIndicator from "./JoinPendingIndicator";

/**
 * The indicator is the only sign a create/join emit is awaiting its reply —
 * without it a cold dyno reads as a swallowed click. Copy appearing and
 * clearing is the whole feature, and both fail silently.
 */

const setPending = (pending: JoinPending) =>
    act(() => useMinesweeperStore.getState().setJoinPending(pending));

beforeEach(() => {
    vi.useFakeTimers();
    setPending(null);
});

afterEach(() => {
    vi.useRealTimers();
});

describe("JoinPendingIndicator", () => {
    test("renders nothing when no join is in flight", () => {
        render(<JoinPendingIndicator />);
        expect(screen.queryByRole("status")).toBeNull();
    });

    test.each([
        ["join", /joining room/i],
        ["create", /creating room/i],
    ] as const)("a pending %s names the wait", (pending, copy) => {
        render(<JoinPendingIndicator />);
        setPending(pending);

        expect(screen.getByRole("status").textContent).toMatch(copy);
    });

    test("a long wait earns the cold-start explanation", () => {
        render(<JoinPendingIndicator />);
        setPending("join");
        expect(screen.getByRole("status").textContent).not.toMatch(/waking up/i);

        act(() => {
            vi.advanceTimersByTime(9000);
        });

        expect(screen.getByRole("status").textContent).toMatch(/waking up/i);
    });

    test("the server's answer clears it", () => {
        render(<JoinPendingIndicator />);
        setPending("join");
        setPending(null);

        expect(screen.queryByRole("status")).toBeNull();
    });
});
