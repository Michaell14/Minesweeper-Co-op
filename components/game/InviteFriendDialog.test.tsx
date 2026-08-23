// @vitest-environment jsdom
/**
 * The invite list, and the one way it goes quietly wrong.
 *
 * A failed roster fetch used to latch: the dialog stored an empty list, never
 * asked again, and told the player none of their friends were online for the
 * rest of the session. Nothing about that looks broken on screen, which is
 * exactly why it is here rather than in the smoke suite.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import InviteFriendDialog from "./InviteFriendDialog";

const fetchFriends = vi.hoisted(() => vi.fn());
vi.mock("@/lib/friendsApi", () => ({ fetchFriends }));

const ALEX = { id: "u1", displayName: "Alex", avatar: null };

/** What opening the dialog looks like from the element's side. */
const open = async (dialog: HTMLDialogElement) => {
    dialog.open = true;
    await act(async () => {
        dialog.dispatchEvent(new Event("toggle"));
    });
};

const close = (dialog: HTMLDialogElement) => {
    dialog.open = false;
};

afterEach(() => {
    cleanup();
    fetchFriends.mockReset();
    act(() => useMinesweeperStore.getState().setOnlineFriends([]));
});

describe("a roster fetch that fails", () => {
    it("is retried on the next open, and says so meanwhile", async () => {
        act(() => useMinesweeperStore.getState().setOnlineFriends([ALEX.id]));
        fetchFriends.mockResolvedValueOnce(null);
        const { container } = render(<InviteFriendDialog inviteFriend={vi.fn()} />);
        const dialog = container.querySelector("dialog") as HTMLDialogElement;

        await open(dialog);
        expect(screen.getByText(/Could not load your friends/)).toBeTruthy();
        expect(screen.queryByText(/None of your friends are online/)).toBeNull();

        fetchFriends.mockResolvedValueOnce({ friends: [ALEX], incoming: [], outgoing: [], blocked: [], code: null });
        close(dialog);
        await open(dialog);

        expect(fetchFriends).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("button", { name: `Invite ${ALEX.displayName} to this room` })).toBeTruthy();
    });
});

describe("a roster fetch that works", () => {
    it("is not repeated when the dialog is opened again", async () => {
        fetchFriends.mockResolvedValue({ friends: [ALEX], incoming: [], outgoing: [], blocked: [], code: null });
        const { container } = render(<InviteFriendDialog inviteFriend={vi.fn()} />);
        const dialog = container.querySelector("dialog") as HTMLDialogElement;

        await open(dialog);
        close(dialog);
        await open(dialog);

        expect(fetchFriends).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/None of your friends are online/)).toBeTruthy();
    });
});
