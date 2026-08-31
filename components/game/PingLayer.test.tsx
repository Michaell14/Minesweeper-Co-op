// @vitest-environment jsdom
/**
 * The ping rings and what a screen reader is told about them.
 *
 * The ring is `aria-hidden`, so the live region IS the ping for anyone not
 * looking at the board — and it has to name the same square the cell's own
 * label does, one-based, or the two halves of the app disagree about which
 * cell is which. jsdom has no layout engine, so where the ring sits is the
 * smoke suite's job.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { useMinesweeperStore } from "@/app/store";
import { PING_LIFETIME_MS } from "@/lib/emotes";
import PingLayer from "./PingLayer";

const boardRef = { current: null } as React.RefObject<HTMLDivElement | null>;

const push = (over: Partial<{ key: string; id: string; name: string; row: number; col: number; expiresAt: number }> = {}) =>
    act(() => {
        useMinesweeperStore.getState().pushPlayerPing({
            key: "p1",
            id: "sock-1",
            name: "Alex",
            row: 3,
            col: 6,
            expiresAt: Date.now() + PING_LIFETIME_MS,
            ...over,
        });
    });

beforeEach(() => useMinesweeperStore.getState().clearPlayerPings());

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useMinesweeperStore.getState().clearPlayerPings();
});

describe("the ring", () => {
    it("names who pinged", () => {
        render(<PingLayer boardRef={boardRef} />);
        push();

        expect(screen.getByText("Alex")).toBeTruthy();
    });

    it("draws one ring per ping", () => {
        const { container } = render(<PingLayer boardRef={boardRef} />);
        push({ key: "p1" });
        push({ key: "p2", name: "Sam", row: 0, col: 0 });

        expect(container.querySelectorAll("[data-ping]")).toHaveLength(2);
    });

    it("is decorative — the announcement carries it instead", () => {
        const { container } = render(<PingLayer boardRef={boardRef} />);
        push();

        expect(container.querySelector("[data-ping]")?.getAttribute("aria-hidden")).toBe("true");
    });
});

describe("the announcement", () => {
    /*
     * One-based, matching cellAriaLabel. A ping exists so two people can mean
     * the same square; an off-by-one here means they do not.
     */
    it("names the cell the way the cell names itself", () => {
        const { container } = render(<PingLayer boardRef={boardRef} />);
        push({ row: 3, col: 6 });

        const live = container.querySelector('[aria-live="polite"]');
        expect(live?.textContent).toBe("Alex pinged row 4, column 7");
    });

    it("is polite, never interrupting", () => {
        const { container } = render(<PingLayer boardRef={boardRef} />);
        expect(container.querySelector('[aria-live="assertive"]')).toBeNull();
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    });

    // Mounted before anything pings, so the first announcement is not lost to a
    // region that appeared carrying its own text.
    it("exists before the first ping", () => {
        const { container } = render(<PingLayer boardRef={boardRef} />);
        expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    });
});

describe("expiry", () => {
    it("clears a ring once its lifetime is up", () => {
        vi.useFakeTimers();
        render(<PingLayer boardRef={boardRef} />);
        push();
        expect(screen.getByText("Alex")).toBeTruthy();

        act(() => void vi.advanceTimersByTime(PING_LIFETIME_MS + 50));

        expect(screen.queryByText("Alex")).toBeNull();
    });

    /*
     * The EmoteBar bug, guarded here too: a timer that fires before the wall
     * clock agrees expires nothing, which leaves the store's array identity
     * alone — so the loop has to re-arm from its own callback rather than from
     * that array, or the ring sits on the board forever.
     */
    it("keeps expiring after a timer fires before its deadline", () => {
        vi.useFakeTimers();
        let clock = Date.now();
        vi.spyOn(Date, "now").mockImplementation(() => clock);

        render(<PingLayer boardRef={boardRef} />);
        push({ expiresAt: clock + PING_LIFETIME_MS });

        act(() => { clock += PING_LIFETIME_MS - 1; vi.advanceTimersByTime(PING_LIFETIME_MS); });
        expect(screen.getByText("Alex"), "not due yet").toBeTruthy();

        act(() => { clock += 50; vi.advanceTimersByTime(50); });
        expect(screen.queryByText("Alex")).toBeNull();
    });
});
