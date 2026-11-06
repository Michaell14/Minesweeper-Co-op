// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import type { AppSocket } from '@/lib/initSocket';
import { CLIENT_EVENTS } from '@/shared/events';
import { useGameActions } from './useGameActions';

const fakeSocket = () => ({ id: 'sock-1', emit: vi.fn() }) as unknown as AppSocket;
const state = () => useMinesweeperStore.getState();

beforeEach(() => {
    useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true);
    localStorage.clear();
});

test('leaving keeps the guest name available for the next room', () => {
    const socket = fakeSocket();
    const { result } = renderHook(() => useGameActions(socket));
    act(() => {
        state().setName('Alice');
        state().setRoom('first-room');
        state().setPlayerJoined(true);
        result.current.leaveRoom();
    });

    expect(state().playerJoined).toBe(false);
    expect(state().name).toBe('Alice');
    act(() => {
        state().setRoom('next-room');
        result.current.joinRoom();
    });
    expect(socket.emit).toHaveBeenLastCalledWith(CLIENT_EVENTS.JOIN_ROOM, {
        room: 'next-room', name: 'Alice',
    });
});

/** A co-op room with somebody else in it: the only place a cursor is shown. */
const inCompany = () => {
    state().setMode('co-op');
    state().setPlayerStatsInRoom([
        { name: 'Alice', score: 0 },
        { name: 'Bob', score: 0 },
    ]);
};

describe('pending hover cleanup', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        state().setRoom('first-room');
        state().setPlayerJoined(true);
        inCompany();
    });

    afterEach(() => vi.useRealTimers());

    test('leaving the board cannot replay a cell after clearing the cursor', () => {
        const socket = fakeSocket();
        const { result } = renderHook(() => useGameActions(socket));
        result.current.emitCellHover(0, 0);
        result.current.emitCellHover(0, 1);
        result.current.handleBoardLeave();
        vi.advanceTimersByTime(100);

        expect(socket.emit).toHaveBeenLastCalledWith(CLIENT_EVENTS.CELL_HOVER, {
            room: 'first-room', row: -1, col: -1,
        });
        expect(socket.emit).toHaveBeenCalledTimes(2);
    });

    test('a pending hover cannot follow the player into a different room', () => {
        const socket = fakeSocket();
        const { result } = renderHook(() => useGameActions(socket));
        result.current.emitCellHover(0, 0);
        result.current.emitCellHover(0, 1);
        act(() => {
            result.current.leaveRoom();
            state().setRoom('next-room');
            state().setPlayerJoined(true);
        });
        vi.advanceTimersByTime(100);

        expect(socket.emit).not.toHaveBeenCalledWith(CLIENT_EVENTS.CELL_HOVER, {
            room: 'next-room', row: 0, col: 1,
        });
    });

    test('unmount cancels a hover waiting on the old socket', () => {
        const socket = fakeSocket();
        const { result, unmount } = renderHook(() => useGameActions(socket));
        result.current.emitCellHover(0, 0);
        result.current.emitCellHover(0, 1);
        unmount();
        vi.advanceTimersByTime(100);

        expect(socket.emit).toHaveBeenCalledTimes(1);
    });
});

/**
 * Every hover the server receives costs it work, and one nobody can see is
 * pure cost: PVP hovers are dropped on arrival, and alone in a room there is
 * nobody to show one to. Both used to go out ~10 times a second.
 */
describe('a hover is sent only when somebody can see it', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        state().setRoom('first-room');
        state().setPlayerJoined(true);
    });

    afterEach(() => vi.useRealTimers());

    const hoverEmits = (socket: AppSocket) =>
        (socket.emit as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
            ([event]) => event === CLIENT_EVENTS.CELL_HOVER,
        );

    test('co-op with company sends it', () => {
        inCompany();
        const socket = fakeSocket();
        const { result } = renderHook(() => useGameActions(socket));

        result.current.emitCellHover(2, 3);

        expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.CELL_HOVER, { room: 'first-room', row: 2, col: 3 });
    });

    test('alone in a room, neither a cursor nor its clear goes out', () => {
        state().setMode('co-op');
        state().setPlayerStatsInRoom([{ name: 'Alice', score: 0 }]);
        const socket = fakeSocket();
        const { result } = renderHook(() => useGameActions(socket));

        result.current.emitCellHover(2, 3);
        result.current.handleBoardLeave();
        vi.advanceTimersByTime(100);

        expect(hoverEmits(socket)).toEqual([]);
    });

    test('a PVP racer sends none, though the room has two', () => {
        inCompany();
        state().setMode('pvp');
        const socket = fakeSocket();
        const { result } = renderHook(() => useGameActions(socket));

        result.current.emitCellHover(2, 3);
        result.current.handleBoardLeave();
        vi.advanceTimersByTime(100);

        expect(hoverEmits(socket)).toEqual([]);
    });

    test('a co-player arriving is enough to start sending', () => {
        state().setMode('co-op');
        state().setPlayerStatsInRoom([{ name: 'Alice', score: 0 }]);
        const socket = fakeSocket();
        const { result } = renderHook(() => useGameActions(socket));
        result.current.emitCellHover(0, 0);
        vi.advanceTimersByTime(100);

        inCompany();
        result.current.emitCellHover(2, 3);
        vi.advanceTimersByTime(100);

        expect(hoverEmits(socket)).toEqual([[CLIENT_EVENTS.CELL_HOVER, { room: 'first-room', row: 2, col: 3 }]]);
    });
});

describe('the daily clock starts only for a sent first move', () => {
    const closed = { isMine: false, isOpen: false, isFlagged: false, nearbyMines: 0 };

    beforeEach(() => {
        state().setDailyActive(true);
        state().setDailyStatus('ready');
        state().setDailyDate('2026-09-30');
        state().setBoard([[closed, { ...closed, isOpen: true }, { ...closed, isFlagged: true }]]);
        localStorage.setItem('minesweeper_daily_identity', JSON.stringify({ date: '2026-09-30', token: 'test-token' }));
    });

    test.each([1, 2, 99])('opening refused cell %s leaves the attempt ready', (col) => {
        const { result } = renderHook(() => useGameActions(fakeSocket()));
        act(() => result.current.dailyOpenCell(0, col));

        expect(state().dailyStatus).toBe('ready');
        expect(state().startedAt).toBeNull();
    });

    test.each([0, 2, 99])('chording refused cell %s leaves the attempt ready', (col) => {
        const { result } = renderHook(() => useGameActions(fakeSocket()));
        act(() => result.current.dailyChordCell(0, col));

        expect(state().dailyStatus).toBe('ready');
        expect(state().startedAt).toBeNull();
    });

    test.each(['dailyOpenCell', 'dailyChordCell'] as const)('%s without a socket leaves the attempt ready', (action) => {
        const { result } = renderHook(() => useGameActions(null));
        act(() => result.current[action](0, action === 'dailyOpenCell' ? 0 : 1));

        expect(state().dailyStatus).toBe('ready');
        expect(state().startedAt).toBeNull();
    });

    test('a missing attempt token cannot start the clock', () => {
        localStorage.clear();
        const { result } = renderHook(() => useGameActions(fakeSocket()));
        act(() => result.current.dailyOpenCell(0, 0));

        expect(state().dailyStatus).toBe('ready');
        expect(state().startedAt).toBeNull();
    });

    test.each(['dailyOpenCell', 'dailyChordCell'] as const)('%s starts an accepted move once', (action) => {
        const socket = fakeSocket();
        const { result } = renderHook(() => useGameActions(socket));
        const col = action === 'dailyOpenCell' ? 0 : 1;
        act(() => result.current[action](0, col));
        const startedAt = state().startedAt;
        act(() => result.current[action](0, col));

        expect(state().dailyStatus).toBe('in_progress');
        expect(startedAt).toEqual(expect.any(Number));
        expect(state().startedAt).toBe(startedAt);
        expect(socket.emit).toHaveBeenCalledWith(action, {
            dailyAttemptToken: 'test-token', date: '2026-09-30', row: 0, col,
        });
    });
});
