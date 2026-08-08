// @vitest-environment jsdom

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import DailyClient from './DailyClient';
import { useMinesweeperStore } from '@/app/store';
import { consumePlayIntent, markPlayIntent } from '@/lib/dailyIntent';

/**
 * The socket is the whole point of `useGameSession` and none of it is what this
 * file is about. These tests exist for the things that fail SILENTLY: a page
 * that quietly spends the visitor's one attempt for the day looks exactly like
 * one that does not, and a player still holding a room behind the daily view
 * looks exactly like one who left it.
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

const intro = <h1>Minesweeper Daily Challenge</h1>;

const playButton = () => screen.getByRole('button', { name: /daily challenge/i });

/**
 * The two arrivals /daily has to tell apart. Pressing the front page's button
 * is a gesture in this tab; everything else is a cold arrival.
 */
const pressedPlay = () =>
    markPlayIntent({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });

beforeEach(() => {
    [startDaily, leaveDaily, leaveRoom, cancelMatch, push].forEach((m) => m.mockClear());
    mockSocket = { id: 'test-socket' };
    consumePlayIntent(); // drop anything a previous test left pending
    vi.useRealTimers();
    act(() => {
        const store = useMinesweeperStore.getState();
        store.setDailyActive(false);
        store.setDailyStatus('idle');
        store.setPlayerJoined(false);
        store.setMatchSearching(false);
    });
});

describe('/daily before the player opts in', () => {
    test('renders the intro rather than a board', () => {
        render(<DailyClient intro={intro} />);

        expect(screen.getByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeTruthy();
    });

    test('does NOT start an attempt on mount', () => {
        render(<DailyClient intro={intro} />);

        // Arriving from a search result must not consume the one attempt of the
        // day before the visitor has decided to play.
        expect(startDaily).not.toHaveBeenCalled();
    });

    test('the play button starts the attempt', () => {
        render(<DailyClient intro={intro} />);

        fireEvent.click(playButton());

        expect(startDaily).toHaveBeenCalledTimes(1);
    });

    /*
     * `startDaily` returns silently without a socket, and the button is live
     * from hydration — a click in that gap did nothing and said nothing.
     */
    test('a click before the socket exists still starts once it arrives', () => {
        mockSocket = null;
        const { rerender } = render(<DailyClient intro={intro} />);

        fireEvent.click(playButton());
        expect(startDaily).not.toHaveBeenCalled();

        mockSocket = { id: 'test-socket' };
        rerender(<DailyClient intro={intro} />);

        expect(startDaily).toHaveBeenCalledTimes(1);
    });
});

/*
 * The daily and a room are mutually exclusive views sharing one board field.
 * hooks/useGameEvents.ts refuses a SESSION_RESUME offer while `dailyActive` is
 * set, so this route has to raise it for the INTRO too, not just the board —
 * otherwise a resume is accepted behind the intro and the player is silently
 * still in the room they walked out of.
 */
/*
 * Starting consumes the day's one attempt even with no move made
 * (server/controllers/dailyController.js), so the two arrivals cannot be
 * treated alike: pressing "Play Today's Puzzle" is a decision, landing on the
 * page from a search result is not.
 */
describe('/daily arrived at by pressing play', () => {
    test('starts the attempt without a second click', () => {
        pressedPlay();

        render(<DailyClient intro={intro} />);

        expect(startDaily).toHaveBeenCalledTimes(1);
    });

    test('does not show the intro copy while the board is on its way', () => {
        pressedPlay();

        render(<DailyClient intro={intro} />);

        // The complaint this exists for: a page of prose, and a second button
        // reading exactly what the player already pressed.
        expect(screen.queryByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeNull();
        expect(screen.queryByRole('button', { name: /daily challenge/i })).toBeNull();
        expect(screen.getByRole('status')).toBeTruthy();
    });

    test('still starts when the socket lands after the intent is read', () => {
        pressedPlay();
        mockSocket = null;
        const { rerender } = render(<DailyClient intro={intro} />);
        expect(startDaily).not.toHaveBeenCalled();

        mockSocket = { id: 'test-socket' };
        rerender(<DailyClient intro={intro} />);

        expect(startDaily).toHaveBeenCalledTimes(1);
    });

    /*
     * The intent is consumed on read, so a second visit in the same tab is a
     * cold arrival again. Otherwise one press would keep starting attempts.
     */
    test('does not start again on a later visit in the same tab', () => {
        pressedPlay();
        const { unmount } = render(<DailyClient intro={intro} />);
        expect(startDaily).toHaveBeenCalledTimes(1);
        unmount();
        startDaily.mockClear();

        render(<DailyClient intro={intro} />);

        expect(startDaily).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeTruthy();
    });

    /*
     * `startDaily`'s server handler emits nothing when it fails, so a dropped
     * socket or a Redis blip leaves the page with nothing to wait for. It has
     * to hand the button back rather than sit on a loading line forever.
     */
    test('falls back to the intro when the server never answers', () => {
        vi.useFakeTimers();
        pressedPlay();

        render(<DailyClient intro={intro} />);
        expect(screen.queryByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeNull();

        act(() => {
            vi.advanceTimersByTime(20_000);
        });

        expect(screen.getByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeTruthy();
        expect(screen.getByRole('button', { name: /daily challenge/i })).toBeTruthy();
    });

    test('does not fall back once the board has arrived', () => {
        vi.useFakeTimers();
        pressedPlay();

        render(<DailyClient intro={intro} />);
        act(() => {
            useMinesweeperStore.getState().setDailyStatus('ready');
            vi.advanceTimersByTime(20_000);
        });

        expect(screen.queryByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeNull();
    });
});

/*
 * The intent must come from a gesture in this tab, never from a URL. A public
 * `?play=1` link would spend the reader's one attempt for the day on arrival.
 */
describe('the play intent cannot be forged', () => {
    test('a query parameter does not start anything', () => {
        window.history.replaceState(null, '', '/daily?play=1');

        render(<DailyClient intro={intro} />);

        expect(startDaily).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeTruthy();

        window.history.replaceState(null, '', '/daily');
    });

    test('a modified click does not record intent for this tab', () => {
        // Cmd-click opens a new tab, whose module state is fresh; recording it
        // here would arm THIS tab for some later unrelated visit.
        markPlayIntent({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false });

        render(<DailyClient intro={intro} />);

        expect(startDaily).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeTruthy();
    });
});

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

        // PLAYER_LEAVE is what calls forgetRoom server-side; without it the
        // session stays resumable and the next connection is offered it back.
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

        // The full leave, not just the daily slice: a run clock left standing
        // gets recorded by the next room that announces a win.
        expect(leaveDaily).toHaveBeenCalled();
    });
});

describe('/daily once the attempt is loaded', () => {
    test('swaps the intro for the board', () => {
        render(<DailyClient intro={intro} />);

        act(() => {
            useMinesweeperStore.getState().setDailyStatus('ready');
        });

        expect(screen.queryByRole('heading', { name: 'Minesweeper Daily Challenge' })).toBeNull();
    });

    /*
     * The button says "Return to Home", and on its own route clearing the daily
     * state alone lands on this page's intro instead — a control that quietly
     * stopped doing what it says.
     */
    test('leaving clears daily state AND goes home, as the button promises', () => {
        render(<DailyClient intro={intro} />);
        act(() => {
            useMinesweeperStore.getState().setDailyStatus('ready');
        });
        leaveDaily.mockClear();

        fireEvent.click(screen.getByRole('button', {
            name: 'Leave daily challenge and return to home page',
        }));

        expect(leaveDaily).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith('/');
    });
});
