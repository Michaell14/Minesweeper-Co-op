// @vitest-environment jsdom

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import MatchSearchingDialog from './MatchSearchingDialog';
import { useMinesweeperStore } from '@/app/store';
import { DEFAULT_PRESET } from '@/shared/boardConfig';
import { boardKey, clearBestTimes, recordBestTime } from '@/lib/bestTimes';
import { PRACTICE_PAR_MS } from '@/lib/practice';

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
    test('is there as soon as the search opens', () => {
        act(() => useMinesweeperStore.getState().setMatchSearching(true));
        const { container } = render(<MatchSearchingDialog {...props()} />);
        reveal(container);

        expect(practiceButton()).not.toBeNull();
    });

    test('names the record of a player who already has a time on this board', () => {
        recordBestTime(boardKey(DEFAULT_PRESET.rows, DEFAULT_PRESET.cols, DEFAULT_PRESET.mines), {
            seconds: 125,
            players: 1,
            at: 1,
        });

        act(() => useMinesweeperStore.getState().setMatchSearching(true));
        const { container } = render(<MatchSearchingDialog {...props()} />);
        reveal(container);

        expect(practiceButton()).not.toBeNull();
        expect(screen.getByText(/your best time of 2:05/)).toBeTruthy();
    });

    test('a player with no record races a par, and is told it is a par', () => {
        act(() => useMinesweeperStore.getState().setMatchSearching(true));
        const { container } = render(<MatchSearchingDialog {...props()} />);
        reveal(container);

        const minutes = PRACTICE_PAR_MS / 60000;
        expect(screen.getByText(new RegExp(`par time of ${minutes}:00`))).toBeTruthy();
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

describe('dismissing the search without the Cancel button', () => {
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
        act(() => useMinesweeperStore.getState().setMatchSearching(false));
        const p = props();
        const { container } = render(<MatchSearchingDialog {...p} />);

        dismiss(container, 'close');

        expect(p.cancelMatch).not.toHaveBeenCalled();
    });

    test('a found match closes it without cancelling the search it just won', () => {
        act(() => useMinesweeperStore.getState().setMatchSearching(false));
        const p = props();
        const { container } = render(<MatchSearchingDialog {...p} />);

        dismiss(container, 'close');

        expect(p.cancelMatch).not.toHaveBeenCalled();
    });
});
