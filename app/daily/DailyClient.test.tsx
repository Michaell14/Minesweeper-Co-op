// @vitest-environment jsdom

import { beforeAll, describe, expect, test, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DailyClient from './DailyClient';
import { useMinesweeperStore } from '@/app/store';
import { markDailyExplainerSeen } from '@/lib/dailyExplainerSeen';
import { DIALOGS } from '@/lib/dialogs';

/**
 * Not about the socket. These tests cover what fails SILENTLY: a page that
 * quietly stops starting the attempt, a player still holding a room behind the
 * daily view, or an explainer that greets a regular every morning.
 */
const startDaily = vi.fn();
const leaveDaily = vi.fn();
const leaveRoom = vi.fn();
const cancelMatch = vi.fn();
const push = vi.fn();

/** Swapped per test to model `useSocket` before and after its effect runs. */
let mockSocket: unknown = { id: 'test-socket' };

// jsdom has no app-router context, so useRouter throws on sight.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/hooks/useGameSession', () => ({
    useGameSession: () => ({
        socket: mockSocket,
        actions: new Proxy({ startDaily, leaveDaily, leaveRoom, cancelMatch }, {
            get: (target: Record<string, unknown>, key: string) => target[key] ?? (() => {}),
        }),
    }),
}));

const intro = <h2>Minesweeper Daily Challenge</h2>;

const introHeading = () => screen.queryByRole('heading', { name: 'Minesweeper Daily Challenge' });

/*
 * jsdom has no showModal; the rest of the suite sets `dialog.open` by hand.
 * Here the call itself is under test, so it is stubbed rather than bypassed.
 */
beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true;
    };
});

const explainerIsOpen = () =>
    (document.getElementById(DIALOGS.dailyIntro) as HTMLDialogElement | null)?.open === true;

/** The server answering `startDaily`. */
const boardArrives = () =>
    act(() => {
        useMinesweeperStore.getState().setDailyStatus('ready');
    });

beforeEach(() => {
    [startDaily, leaveDaily, leaveRoom, cancelMatch, push].forEach((m) => m.mockClear());
    mockSocket = { id: 'test-socket' };
    localStorage.clear();
    vi.useRealTimers();
    act(() => {
        const store = useMinesweeperStore.getState();
        store.setDailyActive(false);
        store.setDailyStatus('idle');
        store.setPlayerJoined(false);
        store.setMatchSearching(false);
    });
});

/*
 * The page opens on the puzzle. Starting consumes the day's attempt
 * (server/controllers/dailyController.js), but a fresh attempt is stored with
 * `startedAt: null` and resumes under the same token, so arriving costs nothing.
 */
describe('/daily on arrival', () => {
    test('starts the attempt on mount, with no click', () => {
        render(<DailyClient intro={intro} />);

        expect(startDaily).toHaveBeenCalledTimes(1);
    });

    test('shows neither the prose nor a play button while the board is on its way', () => {
        render(<DailyClient intro={intro} />);

        // No page of prose in front of the puzzle.
        expect(introHeading()).toBeNull();
        expect(screen.queryByRole('button', { name: /daily challenge/i })).toBeNull();
        expect(screen.getByText(/Loading today/)).toBeTruthy();
    });

    /*
     * `startDaily` returns silently without a socket, and this effect runs
     * before `useSocket`'s — dropping the start there would leave the page on a
     * loading line for fifteen seconds before offering a button.
     */
    test('still starts when the socket lands after mount', () => {
        mockSocket = null;
        const { rerender } = render(<DailyClient intro={intro} />);
        expect(startDaily).not.toHaveBeenCalled();

        mockSocket = { id: 'test-socket' };
        rerender(<DailyClient intro={intro} />);

        expect(startDaily).toHaveBeenCalledTimes(1);
    });

    /*
     * The server handler emits nothing on failure, so the page has nothing to
     * wait for and must hand the button back rather than load forever.
     */
    test('falls back to the prose and a retry button when the server never answers', () => {
        vi.useFakeTimers();

        render(<DailyClient intro={intro} />);
        expect(introHeading()).toBeNull();

        act(() => {
            vi.advanceTimersByTime(20_000);
        });

        expect(introHeading()).toBeTruthy();
        const retry = screen.getByRole('button', { name: /daily challenge/i });
        startDaily.mockClear();
        fireEvent.click(retry);
        expect(startDaily).toHaveBeenCalledTimes(1);
    });

    /*
     * The held start fires whenever the socket lands, including after the
     * timeout has already handed the page back — and a request in flight has
     * to say so, or the page sits on the prose with nothing to fall back from.
     */
    test('shows the loading line again when the socket lands after the timeout', () => {
        vi.useFakeTimers();

        mockSocket = null;
        const { rerender } = render(<DailyClient intro={intro} />);
        act(() => {
            vi.advanceTimersByTime(20_000);
        });
        expect(introHeading()).toBeTruthy();

        mockSocket = { id: 'test-socket' };
        act(() => {
            rerender(<DailyClient intro={intro} />);
        });

        expect(startDaily).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/Loading today/)).toBeTruthy();

        // And it can time out again rather than stranding them on it.
        act(() => {
            vi.advanceTimersByTime(20_000);
        });
        expect(screen.getByRole('button', { name: /daily challenge/i })).toBeTruthy();
    });

    /*
     * A retry against a server that is still down has to look like a retry.
     * Without the pending state the click leaves the prose and the button
     * exactly where they were, and arms no second timeout to fall back from.
     */
    test('the retry button shows the loading line again, and can time out again', () => {
        vi.useFakeTimers();

        render(<DailyClient intro={intro} />);
        act(() => {
            vi.advanceTimersByTime(20_000);
        });

        fireEvent.click(screen.getByRole('button', { name: /daily challenge/i }));
        expect(screen.getByText(/Loading today/)).toBeTruthy();
        expect(introHeading()).toBeNull();

        act(() => {
            vi.advanceTimersByTime(20_000);
        });

        expect(screen.queryByText(/Loading today/)).toBeNull();
        expect(screen.getByRole('button', { name: /daily challenge/i })).toBeTruthy();
    });

    test('does not fall back once the board has arrived', () => {
        vi.useFakeTimers();

        render(<DailyClient intro={intro} />);
        act(() => {
            useMinesweeperStore.getState().setDailyStatus('ready');
            vi.advanceTimersByTime(20_000);
        });

        // Not queryByRole('status') — the board's own empty state is one too.
        expect(screen.queryByText(/Loading today/)).toBeNull();
        expect(introHeading()).toBeTruthy();
    });
});

/*
 * The rules are a dialog now, so this flag being read correctly is all that
 * stands between a first-time player and an unexplained one-shot timed board.
 */
describe('the first-visit explainer', () => {
    test('opens once the board is there, on a browser that has never played', () => {
        render(<DailyClient intro={intro} />);
        expect(explainerIsOpen()).toBe(false); // nothing to explain yet

        boardArrives();

        expect(explainerIsOpen()).toBe(true);
    });

    test('does not open for a browser that has already seen it', () => {
        markDailyExplainerSeen();

        render(<DailyClient intro={intro} />);
        boardArrives();

        expect(explainerIsOpen()).toBe(false);
    });

    /*
     * A terminal resume loads a board through the same field, and
     * DAILY_ALREADY_ATTEMPTED opens the submit / already-played dialog itself.
     * Both are showModal'd, so an explainer that fires here lands on top of the
     * result the player came back for.
     */
    test.each(['won_pending_submit', 'completed', 'failed'] as const)(
        'stays shut on a terminal resume (%s), where a result dialog is already up',
        (status) => {
            render(<DailyClient intro={intro} />);
            act(() => {
                useMinesweeperStore.getState().setDailyStatus(status);
            });

            expect(explainerIsOpen()).toBe(false);
        },
    );

    /*
     * Dismissal is what writes the flag, via the dialog's own onClose — Escape
     * closes a native <dialog> without submitting any form, so a flag written
     * on the button alone would bring the explainer back forever.
     */
    test('is not marked seen merely by being shown', () => {
        render(<DailyClient intro={intro} />);
        boardArrives();

        expect(localStorage.getItem('minesweeper_daily_explainer_seen')).toBeNull();
    });
});

/*
 * The daily and a room are mutually exclusive views sharing one board field.
 * hooks/useGameEvents.ts refuses a SESSION_RESUME offer while `dailyActive` is
 * set, so this route has to raise it before any offer can arrive.
 */
describe('/daily is exclusive with a room', () => {
    test('marks the daily view active on arrival, before any board exists', () => {
        render(<DailyClient intro={intro} />);

        expect(useMinesweeperStore.getState().dailyActive).toBe(true);
    });

    test('leaves the room when arriving from one', () => {
        act(() => {
            useMinesweeperStore.getState().setPlayerJoined(true);
        });

        render(<DailyClient intro={intro} />);

        // PLAYER_LEAVE calls forgetRoom server-side; without it the session stays resumable.
        expect(leaveRoom).toHaveBeenCalledTimes(1);
    });

    test('leaves the quick-match queue when arriving from one', () => {
        act(() => {
            useMinesweeperStore.getState().setMatchSearching(true);
        });

        render(<DailyClient intro={intro} />);

        expect(cancelMatch).toHaveBeenCalledTimes(1);
    });

    test('leaves nothing when arriving with no room and no search', () => {
        render(<DailyClient intro={intro} />);

        expect(leaveRoom).not.toHaveBeenCalled();
        expect(cancelMatch).not.toHaveBeenCalled();
    });

    test('clears the daily view on navigating away', () => {
        const { unmount } = render(<DailyClient intro={intro} />);
        leaveDaily.mockClear();

        unmount();

        // The full leave: a run clock left standing gets recorded by the next room that wins.
        expect(leaveDaily).toHaveBeenCalled();
    });
});

describe('/daily once the attempt is loaded', () => {
    test('shows the board with the prose below it, not instead of it', () => {
        render(<DailyClient intro={intro} />);

        boardArrives();

        // Both on the page: the board is what the player came for, the prose is
        // what makes /daily worth indexing.
        expect(screen.getByRole('heading', { name: 'Daily Challenge' })).toBeTruthy();
        expect(introHeading()).toBeTruthy();
    });

    /* The button says "Return to Home"; clearing daily state alone lands on this page's prose. */
    test('leaving clears daily state AND goes home, as the button promises', () => {
        render(<DailyClient intro={intro} />);
        boardArrives();
        leaveDaily.mockClear();

        fireEvent.click(screen.getByRole('button', {
            name: 'Leave daily challenge and return to home page',
        }));

        expect(leaveDaily).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith('/');
    });
});
