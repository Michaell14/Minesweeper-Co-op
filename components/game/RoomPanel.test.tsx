// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import type { PlayerStats } from "@/shared/socketPayloads";

/*
 * The panel reads `useSession` to decide whether to offer the invite button,
 * and the real hook throws outside a <SessionProvider>. Signed OUT by default
 * so every case below is about the code and the copy, as it was.
 */
const mockStatus = vi.fn(() => "unauthenticated");
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: mockStatus() }) }));

import RoomPanel from "./RoomPanel";

/**
 * The room code, and whether it reads as an invitation.
 *
 * A co-op room with nobody else in it is the most common state a new player
 * sees, and it used to be indistinguishable from a full one. The difference is
 * pure copy, which is exactly the kind of thing that regresses quietly: nothing
 * throws, nothing looks broken, the prompt just stops appearing.
 */

const stats = (...names: string[]): PlayerStats[] =>
    names.map((name) => ({ name, score: 0 }));

/**
 * jsdom has no clipboard, and `navigator.clipboard` is getter-only so it cannot
 * simply be assigned. Without a stub the component's own catch swallows the
 * failure and the button silently never changes — which would make the test
 * below pass for the wrong reason.
 */
const stubClipboard = (writeText: () => Promise<void>) =>
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });

const setRoom = (mode: "co-op" | "pvp", players: PlayerStats[]) => {
    const store = useMinesweeperStore.getState();
    store.setRoom("ABC123");
    store.setMode(mode);
    store.setPlayerStatsInRoom(players);
};

beforeEach(() => setRoom("co-op", stats("Alice")));

afterEach(() => {
    const store = useMinesweeperStore.getState();
    store.setRoom("");
    store.setMode("co-op");
    store.setPlayerStatsInRoom([]);
});

describe("alone in a co-op room", () => {
    test("asks you to invite someone", () => {
        render(<RoomPanel />);

        expect(screen.getByText(/only one here/i)).toBeDefined();
    });

    test("the heading is an invitation rather than a label", () => {
        render(<RoomPanel />);

        expect(screen.getByText("Invite a friend")).toBeDefined();
    });

    /* A room nobody has reported on yet is still a room of one. */
    test("an empty roster reads the same as a room of one", () => {
        setRoom("co-op", []);
        render(<RoomPanel />);

        expect(screen.getByText(/only one here/i)).toBeDefined();
    });
});

describe("once someone joins", () => {
    beforeEach(() => setRoom("co-op", stats("Alice", "Bob")));

    test("the prompt goes away", () => {
        render(<RoomPanel />);

        expect(screen.queryByText(/only one here/i)).toBeNull();
    });

    test("the heading goes back to labelling the code", () => {
        render(<RoomPanel />);

        expect(screen.getByText("Room:")).toBeDefined();
    });
});

/*
 * PVP has its own waiting-for-opponent copy and a Start button gated on the
 * second player, so it already says all of this. Saying it twice would be two
 * places to keep in step.
 */
describe("in PVP", () => {
    test("stays quiet even with one player, because PVP says it elsewhere", () => {
        setRoom("pvp", stats("Alice"));
        render(<RoomPanel />);

        expect(screen.queryByText(/only one here/i)).toBeNull();
        expect(screen.getByText("Room:")).toBeDefined();
    });
});

describe("always", () => {
    test("shows the room code, whoever is in it", () => {
        render(<RoomPanel />);

        expect(screen.getByLabelText("Room code: ABC123")).toBeDefined();
    });

    test("offers a shareable link", () => {
        render(<RoomPanel />);

        expect(screen.getByRole("button", { name: /copy shareable room link/i })).toBeDefined();
    });

    test("confirms the copy, and says so out loud for screen readers", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        render(<RoomPanel />);

        fireEvent.click(screen.getByRole("button", { name: /copy shareable room link/i }));

        await waitFor(() =>
            expect(screen.getByRole("button", { name: /copy/i }).textContent).toBe("Copied!"));
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ABC123"));
        // A hidden live region, because a screen reader will not reliably
        // announce a change to the button's own label.
        expect(screen.getByText("Link copied to clipboard")).toBeDefined();
    });

    /* A denied clipboard must not throw; the button just stays as it was. */
    test("survives a clipboard the browser refuses", async () => {
        stubClipboard(vi.fn().mockRejectedValue(new Error("denied")));
        render(<RoomPanel />);

        fireEvent.click(screen.getByRole("button", { name: /copy shareable room link/i }));

        await waitFor(() =>
            expect(screen.getByRole("button", { name: /copy/i }).textContent).toBe("Copy Link"));
    });
});

describe("the invite button", () => {
    /*
     * Signed-in only: a friend list needs an account. The Copy Link path above
     * is what a guest uses, and it stays the primary way in for everybody.
     */
    test("is not offered to a guest", () => {
        mockStatus.mockReturnValue("unauthenticated");
        render(<RoomPanel inviteFriend={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Invite a friend to this room" })).toBeNull();
    });

    test("is offered to a signed-in player", () => {
        mockStatus.mockReturnValue("authenticated");
        render(<RoomPanel inviteFriend={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Invite a friend to this room" })).toBeTruthy();
    });

    // The daily passes no handler: it is not a room, and there is nobody to
    // invite into it.
    test("is not offered where there is no room to invite into", () => {
        mockStatus.mockReturnValue("authenticated");
        render(<RoomPanel />);
        expect(screen.queryByRole("button", { name: "Invite a friend to this room" })).toBeNull();
    });

    /*
     * The panel is mounted once per layout cluster, so it must carry the
     * button and NOT the dialog — two <dialog> elements sharing an id is one
     * openDialog away from opening the wrong one.
     */
    test("carries no dialog of its own", () => {
        mockStatus.mockReturnValue("authenticated");
        const { container } = render(<RoomPanel inviteFriend={vi.fn()} />);
        expect(container.querySelector("dialog")).toBeNull();
    });
});
