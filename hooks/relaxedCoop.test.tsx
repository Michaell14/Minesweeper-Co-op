// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useMinesweeperStore } from '@/app/store';
import { useGameEvents } from './useGameEvents';
import { useGameActions } from './useGameActions';
import { useGameStats } from './useGameStats';
import { SERVER_EVENTS as E } from '@/shared/events';
import { bestsForImport, boardKey, clearBestTimes, labelForKey, readBestTime, recordBestTime } from '@/lib/bestTimes';
import type { AppSocket } from '@/lib/initSocket';
import CreateRoomForm from '@/components/landing/CreateRoomForm';
import StatusBanner from '@/components/game/StatusBanner';
import CoopLives from '@/components/game/CoopLives';
vi.mock('@/lib/confetti', () => ({ shootConfetti: vi.fn() }));
const handlers = () => useGameEvents({ id: 'alice', emit: vi.fn() } as unknown as AppSocket, vi.fn());
beforeEach(() => {
    useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true);
    useMinesweeperStore.getState().setRoom('relax');
    clearBestTimes();
});

test('rules selector defaults to standard, offers sudden death, and hides for PvP', () => {
    const { rerender } = render(<CreateRoomForm />);
    expect(useMinesweeperStore.getState().relaxed).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    fireEvent.click(screen.getByRole('radio', { name: /Sudden death/ }));
    expect(useMinesweeperStore.getState().relaxed).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: /Standard/ }));
    expect(useMinesweeperStore.getState().relaxed).toBe(true);
    expect(screen.getByText(/Standard · 3 shared lives/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /PvP/ }));
    rerender(<CreateRoomForm />);
    expect(screen.queryByRole('radio', { name: /Standard/ })).toBeNull();
});

test('shared-life events update feedback without ending play and ignore other rooms', () => {
    useMinesweeperStore.getState().setPlayerJoined(true);
    const events = handlers();
    events[E.COOP_LIVES]!({ room: 'relax', relaxed: true, livesRemaining: 2 });
    render(<CoopLives />);
    expect(screen.getByText('Standard · 2 / 3 shared lives')).toBeTruthy();
    expect(screen.getByText(/Keep sweeping together/)).toBeTruthy();
    expect(useMinesweeperStore.getState().gameOver).toBe(false);
    events[E.COOP_LIVES]!({ room: 'other', relaxed: true, livesRemaining: 0 });
    expect(useMinesweeperStore.getState().livesRemaining).toBe(2);
});

test('the lives line is in the desktop banner only; mobile shows it below the board', () => {
    // Above the board on a phone it costs the last of the fold (mobileFit in the smoke suite).
    useMinesweeperStore.setState({ mode: 'co-op', relaxed: true, livesRemaining: 3 });
    const { unmount } = render(<StatusBanner startPvpGame={vi.fn()} emitConfetti={vi.fn()} variant="desktop" />);
    expect(screen.getByText('Standard · 3 / 3 shared lives')).toBeTruthy();
    unmount();
    render(<StatusBanner startPvpGame={vi.fn()} emitConfetti={vi.fn()} variant="mobile" />);
    expect(screen.queryByText(/shared lives/)).toBeNull();
});

test('joining a classic room clears previously selected relaxed rules', () => {
    useMinesweeperStore.getState().setRelaxed(true);
    handlers()[E.JOIN_ROOM_SUCCESS]!({ room: 'classic', mode: 'co-op' });
    expect(useMinesweeperStore.getState().relaxed).toBe(false);
});

test('relaxed win is filed separately through the real event handler and survives import', () => {
    const classic = boardKey(16, 16, 40, 2);
    const relaxed = boardKey(16, 16, 40, 2, true);
    recordBestTime(classic, { seconds: 100, players: 2, at: 1000 });
    useMinesweeperStore.setState({ relaxed: true, mode: 'co-op', numRows: 16, numCols: 16, numMines: 40,
        startedAt: 1000, endedAt: 11000, playerStatsInRoom: [{ name: 'Alice', score: 1 }, { name: 'Bob', score: 1 }] });
    handlers()[E.GAME_WON]!();
    expect(readBestTime(classic)?.seconds).toBe(100);
    expect(readBestTime(relaxed)?.seconds).toBe(10);
    expect(labelForKey(relaxed)).toMatch(/^Standard · /);
    expect(bestsForImport(100).map((entry) => entry.boardKey)).toContain(relaxed);
});

test('revealed mines reduce the flag counter without counting as safe progress', () => {
    useMinesweeperStore.setState({ numMines: 2, board: [[
        { isMine: true, isOpen: true, isFlagged: false, nearbyMines: 0 },
        { isMine: false, isOpen: false, isFlagged: true, nearbyMines: 0 },
        { isMine: false, isOpen: true, isFlagged: false, nearbyMines: 2 },
    ]] });
    function Stats() { const stats = useGameStats(); return <p>{stats.remainingFlags} flags, {stats.ownProgress} safe</p>; }
    render(<Stats />);
    expect(screen.getByText('0 flags, 1 safe')).toBeTruthy();
});


test('late life updates after leaving cannot change the next room rules', () => {
    useMinesweeperStore.setState({ playerJoined: true, relaxed: true, livesRemaining: 2 });
    const socket = { id: 'alice', emit: vi.fn() } as unknown as AppSocket;
    const { result } = renderHook(() => useGameActions(socket));
    act(() => result.current.leaveRoom());
    const events = useGameEvents(socket, result.current.leaveRoom);
    act(() => events[E.COOP_LIVES]!({ room: 'relax', relaxed: false, livesRemaining: 1 }));
    expect(useMinesweeperStore.getState()).toMatchObject({ playerJoined: false, relaxed: true, livesRemaining: 3 });
});

test.each(['create', 'join'] as const)('accepts life snapshots during a pending %s', (pending) => {
    useMinesweeperStore.getState().setJoinPending(pending);
    handlers()[E.COOP_LIVES]!({ room: 'relax', relaxed: true, livesRemaining: 2 });
    expect(useMinesweeperStore.getState()).toMatchObject({ relaxed: true, livesRemaining: 2 });
});

test('a resume accepts the life snapshot before join success', () => {
    const events = handlers();
    events[E.SESSION_RESUME]!({ room: 'relax', name: 'Alice' });
    expect(useMinesweeperStore.getState().joinPending).toBe('join');
    events[E.COOP_LIVES]!({ room: 'relax', relaxed: true, livesRemaining: 1 });
    expect(useMinesweeperStore.getState()).toMatchObject({ relaxed: true, livesRemaining: 1 });
    events[E.JOIN_ROOM_SUCCESS]!({ room: 'relax', mode: 'co-op', relaxed: true, livesRemaining: 1 });
    expect(useMinesweeperStore.getState()).toMatchObject({ playerJoined: true, joinPending: null });
});

test('a failed join stops accepting life snapshots', () => {
    const events = handlers();
    useMinesweeperStore.getState().setJoinPending('join');
    events[E.JOIN_ROOM_ERROR]!();
    events[E.COOP_LIVES]!({ room: 'relax', relaxed: true, livesRemaining: 1 });
    expect(useMinesweeperStore.getState()).toMatchObject({ relaxed: true, livesRemaining: 3 });
});
