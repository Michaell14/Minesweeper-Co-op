// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useMinesweeperStore } from "@/app/store";
import { DIALOGS } from "@/lib/dialogs";
import { clearDailyHistory, recordDailyResult } from "@/lib/dailyHistory";
import type { LossDiagnosis } from "@/lib/lossDiagnosis";
import DailyDialogs from "./DailyDialogs";
import { hasSeenDailyExplainer } from "@/lib/dailyExplainerSeen";

/**
 * The daily dialogs mix DialogClose and plain Button: only the leaderboard's
 * Close closes on click. "View Leaderboard" closes its own dialog and opens
 * another by hand (a DialogClose's submit-close would race showModal());
 * "Share Result" stays open so its feedback is visible; Submit waits for the
 * SERVER, or a refusal strands the player with no dialog. As in
 * components/ds/Dialog.test.tsx, this checks the TYPE attribute, since a plain
 * Button that fails to close leaves no trace.
 */

/**
 * All four dialogs render; only the target gets `open`. `getByRole` excludes a
 * closed <dialog>'s contents, but `getByText` does not, and dailyGameOver and
 * dailyAlreadyPlayed share copy, so those queries are scoped with `within`.
 */
const renderOpen = (id: string) => {
    render(<DailyDialogs submitDailyScore={vi.fn()} getDailyLeaderboard={vi.fn()} />);
    const dialog = document.getElementById(id) as HTMLDialogElement;
    dialog.open = true;
    return dialog;
};

beforeEach(() => {
    const store = useMinesweeperStore.getState();
    store.setDailyDate("2026-08-01");
    store.setDailyStatus("failed");
    store.setDailyElapsedMs(92_000);
    store.setDailyRank(null);
    store.setDailyTotalEntries(null);
    store.setDailyLeaderboard([]);
});

afterEach(() => {
    const store = useMinesweeperStore.getState();
    store.resetDailyState();
});

/*
 * The first-visit explainer. /daily opens straight onto the board, so this is
 * the only thing that says what the rules are — and its dismissal is what
 * writes the once-ever flag, including the Escape path a button never sees.
 */
describe("dailyIntro: the rules, once per browser", () => {
    test("Got it is a DialogClose -- a plain button would leave the rules on screen", () => {
        const dialog = renderOpen(DIALOGS.dailyIntro);

        const gotIt = within(dialog).getByRole("button", {
            name: "Close the rules and play today's puzzle",
        });

        expect(gotIt.getAttribute("type")).toBe("submit");
    });

    test("says the three things a newcomer cannot recover from not knowing", () => {
        const dialog = renderOpen(DIALOGS.dailyIntro);
        const text = dialog.textContent ?? "";

        expect(text).toContain("same board");
        expect(text).toContain("One attempt");
        expect(text).toContain("first click");
    });

    test("offers the full rules to someone who has never played Minesweeper", () => {
        const dialog = renderOpen(DIALOGS.dailyIntro);

        const link = within(dialog).getByRole("link", { name: /how to play/i });

        expect(link.getAttribute("href")).toBe("/how-to-play");
    });

    /*
     * Both dismissals write the flag, and each is covered separately because
     * neither mechanism covers both. Escape never reaches a click handler; the
     * `close` event does not fire in every engine (it does not fire at all in
     * Claude Code's embedded Chrome), so the click cannot be left to onClose.
     * Either one failing quietly brings the explainer back every morning.
     */
    test("pressing Got it records that this browser has seen it", () => {
        localStorage.removeItem("minesweeper_daily_explainer_seen");
        const dialog = renderOpen(DIALOGS.dailyIntro);

        fireEvent.click(within(dialog).getByRole("button", {
            name: "Close the rules and play today's puzzle",
        }));

        expect(hasSeenDailyExplainer()).toBe(true);
    });

    test("dismissing with Escape records it too", () => {
        localStorage.removeItem("minesweeper_daily_explainer_seen");
        const dialog = renderOpen(DIALOGS.dailyIntro);

        // What a platform close request reaches the component as.
        fireEvent(dialog, new Event("cancel"));

        expect(hasSeenDailyExplainer()).toBe(true);
    });
});

describe("dailyGameOver: hit a mine, no retry today", () => {
    test("Share Result is a plain button -- it must not close the dialog", () => {
        renderOpen(DIALOGS.dailyGameOver);

        expect(screen.getByRole("button", { name: "Share your daily challenge result" }).getAttribute("type")).toBe("button");
    });

    test("View Leaderboard is a plain button too -- it manages its own dialog transition", () => {
        renderOpen(DIALOGS.dailyGameOver);

        expect(
            screen.getByRole("button", { name: "Close dialog and view today's leaderboard" }).getAttribute("type"),
        ).toBe("button");
    });

    test("reports the run as an alert, and states the elapsed time", () => {
        const dialog = renderOpen(DIALOGS.dailyGameOver);

        expect(screen.getByRole("alertdialog", { name: "Boom!" })).toBeDefined();
        expect(within(dialog).getByText(/1:32/)).toBeDefined();
    });
});

describe("dailyAlreadyPlayed: resumed after a refresh", () => {
    test("shows the failed message when the resumed attempt lost", () => {
        const dialog = renderOpen(DIALOGS.dailyAlreadyPlayed);

        expect(within(dialog).getByText(/You hit a mine at/)).toBeDefined();
    });

    test("shows time and rank when the resumed attempt was completed", () => {
        const store = useMinesweeperStore.getState();
        store.setDailyStatus("completed");
        store.setDailyRank(3);
        const dialog = renderOpen(DIALOGS.dailyAlreadyPlayed);

        expect(within(dialog).getByText(/Your time:/)).toBeDefined();
        expect(within(dialog).getByText(/#3/)).toBeDefined();
    });
});

describe("dailySubmit: won, name goes on the leaderboard", () => {
    /*
     * Submit is a plain Button: the SERVER decides whether a submission lands.
     * Closing on click left a refused player with no dialog and a status stuck
     * at won_pending_submit; `dailyScoreSubmitted` closes it instead.
     */
    test("Submit does NOT close its own dialog -- the server has the last word", () => {
        const store = useMinesweeperStore.getState();
        store.setDailyStatus("won_pending_submit");
        renderOpen(DIALOGS.dailySubmit);

        expect(
            screen.getByRole("button", { name: "Submit your time to the leaderboard" }).getAttribute("type"),
        ).toBe("button");
    });

    /*
     * The room's name dialog gets away with a bare input because its title is
     * "Enter your Name:"; this one's is "You solved it!", and the aria-label
     * is invisible to sighted users, so nothing else notices the label going.
     */
    test("the name field says what to type -- the title cannot", () => {
        const store = useMinesweeperStore.getState();
        store.setDailyStatus("won_pending_submit");
        const dialog = renderOpen(DIALOGS.dailySubmit);

        expect(within(dialog).getByText("Enter a name for the leaderboard:")).toBeDefined();
    });

    /*
     * An emit shows nothing, so until the server answers the button would look
     * untouched: the "dead Submit button" again, with a slow connection.
     */
    describe("while a submission is out", () => {
        const submitValidName = (submitDailyScore = vi.fn()) => {
            render(<DailyDialogs submitDailyScore={submitDailyScore} getDailyLeaderboard={vi.fn()} />);
            const dialog = document.getElementById(DIALOGS.dailySubmit) as HTMLDialogElement;
            dialog.open = true;

            fireEvent.change(screen.getByRole("textbox", { name: "Your name for the leaderboard" }), {
                target: { value: "Alex" },
            });
            fireEvent.click(screen.getByRole("button", { name: "Submit your time to the leaderboard" }));
            return submitDailyScore;
        };

        const submitButton = () =>
            screen.getByRole("button", { name: "Submit your time to the leaderboard" });

        test("the button says so, and stops taking clicks", () => {
            submitValidName();

            expect(submitButton().textContent).toMatch(/submitting/i);
            expect((submitButton() as HTMLButtonElement).disabled).toBe(true);
        });

        test("a second click does not send a second submission", () => {
            const submitDailyScore = submitValidName();

            fireEvent.click(submitButton());

            expect(submitDailyScore).toHaveBeenCalledTimes(1);
        });

        /*
         * A submission that never lands (socket down) would otherwise disable
         * the only way to retry it. On success the dialog has closed long before.
         */
        test("the button comes back if the server never answers", () => {
            vi.useFakeTimers();
            try {
                // Fake timers first, or the button's own setTimeout is not one of theirs.
                submitValidName();
                act(() => {
                    vi.advanceTimersByTime(5000);
                });

                expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
                expect(submitButton().textContent).toMatch(/^Submit$/);
            } finally {
                vi.useRealTimers();
            }
        });

        test("a rejected name never enters the state at all", () => {
            const submitDailyScore = vi.fn();
            render(<DailyDialogs submitDailyScore={submitDailyScore} getDailyLeaderboard={vi.fn()} />);
            (document.getElementById(DIALOGS.dailySubmit) as HTMLDialogElement).open = true;

            fireEvent.click(submitButton());

            expect((submitButton() as HTMLButtonElement).disabled).toBe(false);
        });
    });

    test("rejects an empty name without calling submitDailyScore", () => {
        const submitDailyScore = vi.fn();
        render(<DailyDialogs submitDailyScore={submitDailyScore} getDailyLeaderboard={vi.fn()} />);
        const dialog = document.getElementById(DIALOGS.dailySubmit) as HTMLDialogElement;
        dialog.open = true;

        fireEvent.click(screen.getByRole("button", { name: "Submit your time to the leaderboard" }));

        expect(submitDailyScore).not.toHaveBeenCalled();
        // Rejecting silently would read as a dead Submit button.
        expect(screen.getByRole("alert").textContent).toMatch(/enter a name/i);
    });

    /* `required` is satisfied by spaces, so the input alone does not catch this. */
    test("rejects a name that is only whitespace", () => {
        const submitDailyScore = vi.fn();
        render(<DailyDialogs submitDailyScore={submitDailyScore} getDailyLeaderboard={vi.fn()} />);
        const dialog = document.getElementById(DIALOGS.dailySubmit) as HTMLDialogElement;
        dialog.open = true;

        fireEvent.change(screen.getByRole("textbox", { name: "Your name for the leaderboard" }), {
            target: { value: "   " },
        });
        fireEvent.click(screen.getByRole("button", { name: "Submit your time to the leaderboard" }));

        expect(submitDailyScore).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toBeDefined();
    });

    test("trims and submits a valid name", () => {
        const submitDailyScore = vi.fn();
        render(<DailyDialogs submitDailyScore={submitDailyScore} getDailyLeaderboard={vi.fn()} />);
        const dialog = document.getElementById(DIALOGS.dailySubmit) as HTMLDialogElement;
        dialog.open = true;

        fireEvent.change(screen.getByRole("textbox", { name: "Your name for the leaderboard" }), {
            target: { value: "  Alex  " },
        });
        fireEvent.click(screen.getByRole("button", { name: "Submit your time to the leaderboard" }));

        expect(submitDailyScore).toHaveBeenCalledWith("Alex");
    });
});

describe("dailyLeaderboard: today's standings", () => {
    test("Close IS type=submit", () => {
        renderOpen(DIALOGS.dailyLeaderboard);

        expect(screen.getByRole("button", { name: "Close leaderboard dialog" }).getAttribute("type")).toBe("submit");
    });

    test("only offers Share Result once this player has a completed, submitted run", () => {
        renderOpen(DIALOGS.dailyLeaderboard); // status: 'failed' from beforeEach

        expect(screen.queryByRole("button", { name: "Share your daily challenge result" })).toBeNull();
    });

    test("offers Share Result -- as a plain button -- once the run is completed", () => {
        useMinesweeperStore.getState().setDailyStatus("completed");
        renderOpen(DIALOGS.dailyLeaderboard);

        expect(
            screen.getByRole("button", { name: "Share your daily challenge result" }).getAttribute("type"),
        ).toBe("button");
    });

    test("shows an empty-state prompt before anyone has submitted a time today", () => {
        renderOpen(DIALOGS.dailyLeaderboard);

        expect(screen.getByText(/No times submitted yet today/)).toBeDefined();
    });

    test("renders every submitted entry, fastest first as given", () => {
        useMinesweeperStore.getState().setDailyLeaderboard([
            { name: "Speedy", elapsedMs: 61_000, rank: 1 },
            { name: "Slowpoke", elapsedMs: 125_000, rank: 2 },
        ]);
        renderOpen(DIALOGS.dailyLeaderboard);

        const table = screen.getByRole("table", { name: /leaderboard/i });
        expect(table.textContent).toContain("Speedy");
        expect(table.textContent).toContain("1:01");
        expect(table.textContent).toContain("Slowpoke");
        expect(table.textContent).toContain("2:05");
    });

    test("a signed-in entry shows its avatar; anonymous and pre-avatar rows just the name", () => {
        useMinesweeperStore.getState().setDailyLeaderboard([
            { name: "Speedy", avatar: "fox", elapsedMs: 61_000, rank: 1 },
            { name: "Slowpoke", avatar: null, elapsedMs: 125_000, rank: 2 },
            // A payload from a pre-avatar server lacks the field entirely.
            { name: "Oldtimer", elapsedMs: 180_000, rank: 3 },
        ]);
        renderOpen(DIALOGS.dailyLeaderboard);

        const rows = screen.getAllByRole("row").slice(1); // drop the header row
        expect(rows[0].querySelector("svg")).not.toBeNull();
        expect(rows[1].querySelector("svg")).toBeNull();
        expect(rows[2].querySelector("svg")).toBeNull();
        expect(rows[2].textContent).toContain("Oldtimer");
    });
});

describe("sharing a result", () => {
    /* jsdom has neither API; without a stub the component's catch swallows the
     * failure and a "shows feedback" test would pass for the wrong reason. */
    const stubClipboard = (writeText: () => Promise<void>) =>
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    const shareAndCapture = async (dialogId: string) => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        renderOpen(dialogId);

        fireEvent.click(screen.getByRole("button", { name: "Share your daily challenge result" }));
        await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
        return writeText.mock.calls[0][0] as string;
    };

    /* The share reads the store's board at click time; leftovers would change a later test's text. */
    afterEach(() => {
        useMinesweeperStore.getState().setBoard([]);
        clearDailyHistory();
    });

    test("falls back to the clipboard and shows feedback when there is no native share sheet", async () => {
        const shared = await shareAndCapture(DIALOGS.dailyGameOver);

        expect(shared).toContain("2026-08-01");
        expect(shared).toContain("💥");
        expect(shared).not.toMatch(/isMine|isOpen|nearbyMines/); // never the board
    });

    test("a loss measures its progress from the revealed board", async () => {
        // A terminal loss board as DAILY_BOARD_UPDATE delivers it: 3 of 4 safe cells open.
        const safe = (isOpen: boolean) => ({ isMine: false, isOpen, isFlagged: false, nearbyMines: 1 });
        const mine = { isMine: true, isOpen: true, isFlagged: false, nearbyMines: 0 };
        useMinesweeperStore.getState().setBoard([
            [safe(true), safe(true), mine],
            [safe(true), safe(false), mine],
        ]);

        expect(await shareAndCapture(DIALOGS.dailyGameOver)).toContain("75% cleared");
    });

    test("a win brags about a live local streak", async () => {
        recordDailyResult("2026-07-31", { won: true });
        recordDailyResult("2026-08-01", { won: true });
        useMinesweeperStore.getState().setDailyStatus("completed");

        expect(await shareAndCapture(DIALOGS.dailyLeaderboard)).toContain("🔥 2-day streak");
    });

    test("the pace bar rides the share when the server delivered milestones", async () => {
        useMinesweeperStore.getState().setDailyMilestones([1_000, 2_000]);

        expect(await shareAndCapture(DIALOGS.dailyGameOver)).toContain("🟩🟩💥⬜⬜⬜⬜⬜⬜⬜");
    });

    /* Same rule as lib/dailyShare.test.ts, at the integration level: the pasted link is the plain route. */
    test("links to /daily with no query string", async () => {
        const shared = await shareAndCapture(DIALOGS.dailyGameOver);

        expect(shared).toContain(`${window.location.origin}/daily`);
        expect(shared).not.toContain("?");
    });
});

const diagnosis = (over: Partial<LossDiagnosis> = {}): LossDiagnosis => ({
    kind: "provable-mine",
    lesson: "one-two-one",
    text: "The 2 at row 7, column 4 is flanked by two 1s.",
    clues: [[6, 3], [6, 1]],
    target: [6, 5],
    verdict: "mine",
    ...over,
});

describe("dailyGameOver: the deduction the run missed", () => {
    test("names the pattern and links to its drill", () => {
        useMinesweeperStore.getState().setDailyDiagnosis(diagnosis());

        const dialog = renderOpen(DIALOGS.dailyGameOver);

        expect(within(dialog).getByText(/You missed/)).toBeDefined();
        expect(
            screen.getByRole("link", { name: "Drill a 1-2-1" }).getAttribute("href"),
        ).toBe("/drills/one-two-one");
    });

    test("explains why, in the engine's own words", () => {
        useMinesweeperStore.getState().setDailyDiagnosis(diagnosis());

        const dialog = renderOpen(DIALOGS.dailyGameOver);

        expect(within(dialog).getByText(/flanked by two 1s/)).toBeDefined();
    });

    /* A guess reads differently from a misread: it points at the move they had instead. */
    test("says something different when the cell they took was not provable", () => {
        useMinesweeperStore.getState().setDailyDiagnosis(
            diagnosis({ kind: "guess", lesson: "counting", verdict: "safe" }),
        );

        const dialog = renderOpen(DIALOGS.dailyGameOver);

        expect(within(dialog).getByText(/Nothing proved that cell/)).toBeDefined();
        expect(screen.getByRole("link", { name: "Drill a counting step" })).toBeDefined();
    });

    test("adds nothing when there is no diagnosis", () => {
        renderOpen(DIALOGS.dailyGameOver);

        expect(screen.queryByRole("link", { name: /Drill/ })).toBeNull();
    });
});

describe('closing the terminal dialogs directly', () => {
    test.each([
        ['dialog-daily-game-over'],
        ['dialog-daily-already-played'],
    ])('%s offers a direct Close beside View Leaderboard', (id) => {
        renderOpen(id);

        const dialog = document.getElementById(id)!;
        const close = within(dialog as HTMLElement).getByRole('button', {
            name: 'Close dialog and view your board',
        });
        expect((close as HTMLButtonElement).type).toBe('submit');
        expect(
            within(dialog as HTMLElement).getByRole('button', {
                name: 'Close dialog and view today\'s leaderboard',
            }),
        ).toBeTruthy();
    });
});
