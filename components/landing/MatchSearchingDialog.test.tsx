// @vitest-environment jsdom

/**
 * The quick-match wait dialog.
 *
 * What fails silently here is the Cancel button: it is the only way out of a
 * search, `<Button>` defaults to `type="button"`, and a close button that is
 * not `type="submit"` stops closing its dialog with nothing wrong in the
 * markup — so a player who cannot find an opponent would be stuck behind a
 * modal. `getByRole` fails both when the role goes and when the name stops
 * resolving, which is how the rest of this breaks too.
 *
 * jsdom has no layout engine and does not implement the form-closes-dialog
 * behaviour, so "does it actually close" belongs in the smoke suite; what is
 * checkable here is that the button is reachable, wired, and submitting.
 */

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import MatchSearchingDialog from './MatchSearchingDialog';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_PRESET } from '@/shared/boardConfig';

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

beforeEach(() => {
    act(() => useMinesweeperStore.getState().setMatchSearching(false));
});

describe('MatchSearchingDialog', () => {
    test('names the board a quick match will be played on', () => {
        render(<MatchSearchingDialog cancelMatch={() => {}} />);

        expect(
            screen.getByText(
                new RegExp(`${DEFAULT_PRESET.rows}x${DEFAULT_PRESET.cols}.*${DEFAULT_PRESET.mines} mines`),
            ),
        ).toBeTruthy();
    });

    test('the cancel button leaves the queue and submits, so the dialog closes', () => {
        const cancelMatch = vi.fn();
        const { container } = render(<MatchSearchingDialog cancelMatch={cancelMatch} />);
        reveal(container);

        const cancel = screen.getByRole('button', {
            name: 'Cancel the search and return to the menu',
        });

        // type="submit" is what closes a native <dialog> via its method="dialog"
        // form. A plain button leaves the player stuck behind the modal.
        expect(cancel.getAttribute('type')).toBe('submit');

        cancel.click();
        expect(cancelMatch).toHaveBeenCalledTimes(1);
    });

    test('the wait is counted, so a slow search does not read as a hang', () => {
        vi.useFakeTimers();
        try {
            act(() => useMinesweeperStore.getState().setMatchSearching(true));
            render(<MatchSearchingDialog cancelMatch={() => {}} />);

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
