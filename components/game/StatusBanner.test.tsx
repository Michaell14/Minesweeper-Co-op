// @vitest-environment jsdom
/**
 * The PVP lobby's opponent line. The name is load-bearing copy and the avatar
 * beside it fails silently, so both are asserted — and the anonymous case must
 * NOT render a stray default face that implies an account.
 */
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import StatusBanner from "./StatusBanner";

const arrange = (avatar: string | null) => {
    const store = useMinesweeperStore.getState();
    store.setMode("pvp");
    store.setPvpRoomReady(true);
    store.setPvpStarted(false);
    store.setPvpIsHost(true);
    store.setPvpOpponentName("Rival");
    store.setPvpOpponentAvatar(avatar);
};

const renderBanner = () =>
    render(<StatusBanner startPvpGame={vi.fn()} emitConfetti={vi.fn()} variant="desktop" />);

afterEach(() => {
    cleanup();
    useMinesweeperStore.getState().resetPvpState();
    useMinesweeperStore.getState().setMode("co-op");
});

test("a signed-in opponent shows their avatar beside the name", () => {
    arrange("shinobi");
    renderBanner();

    const line = screen.getByText("Rival").closest("p")!;
    expect(line.textContent).toContain("Opponent:");
    expect(line.querySelector("svg")).not.toBeNull();
});

test("an anonymous opponent is a name alone — no implied account", () => {
    arrange(null);
    renderBanner();

    const line = screen.getByText("Rival").closest("p")!;
    expect(line.querySelector("svg")).toBeNull();
});
