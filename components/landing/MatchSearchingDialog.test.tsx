// @vitest-environment jsdom

/**
 * The quick-match wait dialog.
 *
 * What fails silently here is the Cancel button: it is the only way out of a
 * search, `<Button>` defaults to `type="button"`, and a close button that is
 * not `type="submit"` stops closing its dialog with nothing wrong in the
 * markup — so a player who cannot find an opponent would be stuck behind a
 * modal. The practice button has exactly the same failure mode. `getByRole`
 * fails both when the role goes and when the name stops resolving, which is how
 * the rest of this breaks too.
 *
 * The copy is tested as well, unusually — "no one else is searching" is a
 * factual claim the server's behaviour makes true (a queue cannot hold two
 * waiting players), and a change that made it a guess should have to edit a
 * test that says so.
 *
 * jsdom has no layout engine and does not implement the form-closes-dialog
 * behaviour, so "does it actually close" belongs in the smoke suite; what is
 * checkable here is that the buttons are reachable, wired, and submitting.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import MatchSearchingDialog, { PRACTICE_OFFER_AFTER_SECONDS } from './MatchSearchingDialog';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_PRESET } from '@/shared/boardConfig';
import { boardKey, clearBestTimes, recordBestTime } from '@/lib/bestTimes';
import { PRACTICE_PAR_MS } from '@/lib/practice';

/**
 * A closed <dialog> is hidden from the accessibility tree, so `getByRole` finds
 * nothing inside one — the app opens these imperatively with `showModal()`,
 * which is not something rendering does. Setting `open` is the smallest way to
 * put the contents in the tree; jsdom's <dialog> is partial enough (see
 * CLAUDE.md) that anything about the OPENING belongs in the smoke suite.
 */
const reveal = (container: HTMLElement) => {
    const dialog = container.querySelector('dialog');
    if (!dialog) throw new Error('no dialog rendered');
    dialog.open = true;
};

const props = (overrides: Partial<React.ComponentProps<typeof MatchSearchingDialog>> = {}) => ({
    cancelMatch: vi.fn(),
    startPracticeRace: vi.fn(),
    ...overrides,
});

const practiceButton = () =>
    screen.queryByRole('button', { name: /^Play solo against a target time of/ });

beforeEach(() => {
    clearBestTimes();
    act(() => {
        useMinesweeperStore.getState().setMatchSearching(false);
        useMinesweeperStore.getState().setMatchOthersOnline(0);
    });
});

describe('MatchSearchingDialog', () => {
    test('names the board a quick match will be played on', () => {
        render(<MatchSearchingDialog {...props()} />);

        expect(
            screen.getByText(
                new RegExp(`${DEFAULT_PRESET.rows}x${DEFAULT_PRESET.cols}.*${DEFAULT_PRESET.mines} mines`),
            ),
        ).toBeTruthy();
    });

    test('the cancel button leaves the queue and submits, so the dialog closes', () => {
        const p = props();
        const { container } = render(<MatchSearchingDialog {...p} />);
        reveal(container);

        const cancel = screen.getByRole('button', {
            name: 'Cancel the search and return to the menu',
        });

        // type="submit" is what closes a native <dialog> via its method="dialog"
        // form. A plain button leaves the player stuck behind the modal.
        expect(cancel.getAttribute('type')).toBe('submit');

        cancel.click();
        expect(p.cancelMatch).toHaveBeenCalledTimes(1);
    });

    test('the wait is counted, so a slow search does not read as a hang', () => {
        vi.useFakeTimers();
        try {
            act(() => useMinesweeperStore.getState().setMatchSearching(true));
            render(<MatchSearchingDialog {...props()} />);

            expect(screen.getByText('Waiting 0s')).toBeTruthy();

            act(() => {
                vi.advanceTimersByTime(3000);
            });

            expect(screen.getByText('Waiting 3s')).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('what it says about who is around', () => {
    test('states plainly that nobody else is searching', () => {
        render(<MatchSearchingDialog {...props()} />);
        // Not a guess: reaching this dialog MEANS the queue held nobody
        // pairable, and a later arrival pairs rather than queueing alongside.
        expect(screen.getByText(/No one else is searching right now/)).toBeTruthy();
    });

    test('alone on the server reads as alone, not as an empty queue', () => {
        render(<MatchSearchingDialog {...props()} />);
        expect(screen.getByText(/You're the only one here/)).toBeTruthy();
    });

    test('other players online are reported, since that is what waiting depends on', () => {
        act(() => useMinesweeperStore.getState().setMatchOthersOnline(7));
        render(<MatchSearchingDialog {...props()} />);
        expect(screen.getByText(/7 other players are online/)).toBeTruthy();
    });

    test('one other player is singular', () => {
        act(() => useMinesweeperStore.getState().setMatchOthersOnline(1));
        render(<MatchSearchingDialog {...props()} />);
        expect(screen.getByText(/1 other player is online/)).toBeTruthy();
    });
});

describe('the practice offer', () => {
    test('is withheld at first, so it does not undercut a real match', () => {
        act(() => useMinesweeperStore.getState().setMatchSearching(true));
        const { container } = render(<MatchSearchingDialog {...props()} />);
        reveal(container);

        expect(practiceButton()).toBeNull();
    });

    test('appears once the wait has gone on', () => {
        vi.useFakeTimers();
        try {
            act(() => useMinesweeperStore.getState().setMatchSearching(true));
            const { container } = render(<MatchSearchingDialog {...props()} />);
            reveal(container);

            act(() => {
                vi.advanceTimersByTime(PRACTICE_OFFER_AFTER_SECONDS * 1000);
            });

            expect(practiceButton()).not.toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    test('is immediate for a player who already has a time on this board', () => {
        // They know what practice is and have something to beat; making them
        // sit out the countdown is a worse version of the same offer.
        recordBestTime(boardKey(DEFAULT_PRESET.rows, DEFAULT_PRESET.cols, DEFAULT_PRESET.mines), {
            seconds: 125,
            players: 1,
            at: 1,
        });

        act(() => useMinesweeperStore.getState().setMatchSearching(true));
        const { container } = render(<MatchSearchingDialog {...props()} />);
        reveal(container);

        expect(practiceButton()).not.toBeNull();
        // 125s, as their own record rather than a par dressed up as one.
        expect(screen.getByText(/your best time of 2:05/)).toBeTruthy();
    });

    test('a player with no record races a par, and is told it is a par', () => {
        vi.useFakeTimers();
        try {
            act(() => useMinesweeperStore.getState().setMatchSearching(true));
            const { container } = render(<MatchSearchingDialog {...props()} />);
            reveal(container);
            act(() => {
                vi.advanceTimersByTime(PRACTICE_OFFER_AFTER_SECONDS * 1000);
            });

            const minutes = PRACTICE_PAR_MS / 60000;
            expect(screen.getByText(new RegExp(`par time of ${minutes}:00`))).toBeTruthy();
        } finally {
            vi.useRealTimers();
        }
    });

    test('starting a practice race submits, so the dialog closes behind it', () => {
        recordBestTime(boardKey(DEFAULT_PRESET.rows, DEFAULT_PRESET.cols, DEFAULT_PRESET.mines), {
            seconds: 90,
            players: 1,
            at: 1,
        });
        const p = props();
        const { container } = render(<MatchSearchingDialog {...p} />);
        reveal(container);

        const button = practiceButton();
        expect(button).not.toBeNull();
        expect(button!.getAttribute('type')).toBe('submit');

        button!.click();
        expect(p.startPracticeRace).toHaveBeenCalledTimes(1);
    });
});

/**
 * Dismissing the dialog without pressing Cancel.
 *
 * A modal <dialog> closes on Escape, and that path submits no form — so the
 * Cancel button's handler never ran and the search outlived the dialog. The
 * player was back on the landing page looking idle while still queued, and the
 * next person to search dragged them into a PVP lobby they had not asked for.
 * Reproduced end to end against a real server before this was fixed.
 *
 * jsdom does not implement Escape closing a dialog, so these drive the `close`
 * event the platform emits — which is the seam the fix listens on, and the one
 * thing about this that is checkable without a browser.
 */
describe('dismissing the search without the Cancel button', () => {
    /**
     * Both events, because neither covers every dismissal: a close request
     * (Escape) fires `cancel` and, in Chrome, no `close` at all — measured, and
     * the reason listening on `close` alone did not fix this.
     */
    const dismiss = (container: HTMLElement, event: 'cancel' | 'close') => {
        const dialog = container.querySelector('dialog');
        if (!dialog) throw new Error('no dialog rendered');
        act(() => {
            dialog.dispatchEvent(new Event(event));
        });
    };

    test.each(['cancel', 'close'] as const)(
        'a %s leaves the queue, so nobody is matched with a ghost',
        (event) => {
            act(() => useMinesweeperStore.getState().setMatchSearching(true));
            const p = props();
            const { container } = render(<MatchSearchingDialog {...p} />);

            dismiss(container, event);

            expect(p.cancelMatch).toHaveBeenCalledTimes(1);
        },
    );

    test('does not cancel twice when Cancel was the thing that closed it', () => {
        // Cancel's own click clears the flag before the close event lands, so
        // the guard is what keeps this to one emit rather than two.
        act(() => useMinesweeperStore.getState().setMatchSearching(false));
        const p = props();
        const { container } = render(<MatchSearchingDialog {...p} />);

        dismiss(container, 'close');

        expect(p.cancelMatch).not.toHaveBeenCalled();
    });

    test('a found match closes it without cancelling the search it just won', () => {
        // joinRoomSuccess clears the flag and then closes the dialog. Cancelling
        // here would post a pointless leave-the-queue the instant you are paired.
        act(() => useMinesweeperStore.getState().setMatchSearching(false));
        const p = props();
        const { container } = render(<MatchSearchingDialog {...p} />);

        dismiss(container, 'close');

        expect(p.cancelMatch).not.toHaveBeenCalled();
    });
});
