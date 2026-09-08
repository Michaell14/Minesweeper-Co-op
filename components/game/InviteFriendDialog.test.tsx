// @vitest-environment jsdom
/**
 * The invite list. A failed roster fetch used to latch: an empty list, never
 * asked again, "no friends online" for the session. Nothing looks broken on
 * screen, which is why it is here rather than the smoke suite.
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

    /* A reopen while the first request is in the air cannot start a second one,
     * but it is still a request for fresh data; the latch used to spend it. */
    it("is retried for an open that landed while it was still in the air", async () => {
        act(() => useMinesweeperStore.getState().setOnlineFriends([ALEX.id]));
        let failFirst: (value: null) => void = () => {};
        fetchFriends.mockReturnValueOnce(new Promise<null>((resolve) => { failFirst = resolve; }));
        const { container } = render(<InviteFriendDialog inviteFriend={vi.fn()} />);
        const dialog = container.querySelector("dialog") as HTMLDialogElement;

        await open(dialog);
        expect(fetchFriends).toHaveBeenCalledTimes(1);

        // Reopened before the first answer: no second request yet.
        close(dialog);
        await open(dialog);
        expect(fetchFriends).toHaveBeenCalledTimes(1);

        fetchFriends.mockResolvedValueOnce({ friends: [ALEX], incoming: [], outgoing: [], blocked: [], code: null });
        await act(async () => { failFirst(null); });

        // The reopen is honoured by the failure rather than lost to it.
        expect(fetchFriends).toHaveBeenCalledTimes(2);
        expect(screen.queryByText(/Could not load your friends/)).toBeNull();
        expect(screen.getByRole("button", { name: `Invite ${ALEX.displayName} to this room` })).toBeTruthy();
    });

    /* A reopen is one retry, not a spin: the second failure stops and says so. */
    it("does not loop when the retry fails too", async () => {
        let failFirst: (value: null) => void = () => {};
        fetchFriends.mockReturnValueOnce(new Promise<null>((resolve) => { failFirst = resolve; }));
        const { container } = render(<InviteFriendDialog inviteFriend={vi.fn()} />);
        const dialog = container.querySelector("dialog") as HTMLDialogElement;

        await open(dialog);
        close(dialog);
        await open(dialog);

        fetchFriends.mockResolvedValueOnce(null);
        await act(async () => { failFirst(null); });

        expect(fetchFriends).toHaveBeenCalledTimes(2);
        expect(screen.getByText(/Could not load your friends/)).toBeTruthy();
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
