// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import type { ConnectionStatus } from "@/state/connectionSlice";
import ConnectionBanner from "./ConnectionBanner";

/**
 * The banner exists because every error dialog in the app arrives as a server
 * event — the one failure none of them can report is the server being gone.
 * The copy appearing (and disappearing) IS the feature, and it fails silently,
 * which is what these pin down.
 */

const setStatus = (status: ConnectionStatus) =>
    act(() => useMinesweeperStore.getState().setConnectionStatus(status));

beforeEach(() => {
    vi.useFakeTimers();
    setStatus("connected");
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ConnectionBanner", () => {
    test("says nothing while connected", () => {
        render(<ConnectionBanner />);
        expect(screen.queryByRole("status")).toBeNull();
    });

    test("a drop shows nothing at first — a sub-second blip must not flash a banner", () => {
        render(<ConnectionBanner />);
        setStatus("reconnecting");

        expect(screen.queryByRole("status")).toBeNull();
    });

    test("a drop that lasts announces the reconnect", () => {
        render(<ConnectionBanner />);
        setStatus("reconnecting");

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(screen.getByRole("status").textContent).toMatch(/reconnecting/i);
    });

    test("a blip that repairs itself inside the grace period never shows", () => {
        render(<ConnectionBanner />);
        setStatus("reconnecting");
        act(() => {
            vi.advanceTimersByTime(500);
        });
        setStatus("connected");
        act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(screen.queryByRole("status")).toBeNull();
    });

    test("an unreachable server is reported immediately, with the cold-start hint", () => {
        render(<ConnectionBanner />);
        setStatus("unreachable");

        expect(screen.getByRole("status").textContent).toMatch(/can't reach the server/i);
    });

    test("reconnecting clears the banner", () => {
        render(<ConnectionBanner />);
        setStatus("reconnecting");
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        expect(screen.getByRole("status")).toBeTruthy();

        setStatus("connected");
        expect(screen.queryByRole("status")).toBeNull();
    });
});
