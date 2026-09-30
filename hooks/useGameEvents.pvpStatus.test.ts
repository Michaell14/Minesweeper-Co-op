// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import { useMinesweeperStore } from '@/app/store';
import { SERVER_EVENTS as E } from '@/shared/events';
import type { AppSocket } from '@/lib/initSocket';
import { useGameEvents } from './useGameEvents';

vi.mock('@/lib/confetti', () => ({ shootConfetti: vi.fn() }));

const handlers = () => useGameEvents({ id: 'alice', emit: vi.fn() } as unknown as AppSocket, vi.fn());

beforeEach(() => useMinesweeperStore.setState(useMinesweeperStore.getInitialState(), true));

test('winning the race labels the opponent as having lost', () => {
    handlers()[E.PVP_PLAYER_WON]!({ winnerSocket: 'alice', winnerName: 'Alice' });

    expect(useMinesweeperStore.getState().pvpOpponentStatus).toBe('lost');
    expect(useMinesweeperStore.getState().gameWon).toBe(true);
});

test('losing the race labels the opponent as the winner', () => {
    handlers()[E.PVP_PLAYER_WON]!({ winnerSocket: 'bob', winnerName: 'Bob' });

    expect(useMinesweeperStore.getState().pvpOpponentStatus).toBe('won');
    expect(useMinesweeperStore.getState().gameWon).toBe(false);
});

test('hitting a mine does not put an already-failed opponent back into play', () => {
    const events = handlers();
    events[E.PVP_GAME_STARTED]!({ totalSafeCells: 100 });
    events[E.PVP_OPPONENT_FAILED]!();
    events[E.PVP_GAME_OVER]!();

    expect(useMinesweeperStore.getState().gameOver).toBe(true);
    expect(useMinesweeperStore.getState().pvpOpponentStatus).toBe('failed');

    events[E.PVP_OPPONENT_RESET]!();
    expect(useMinesweeperStore.getState().pvpOpponentStatus).toBe('playing');
});

test('hitting a mine leaves an active opponent playing', () => {
    const events = handlers();
    events[E.PVP_GAME_STARTED]!({ totalSafeCells: 100 });
    events[E.PVP_GAME_OVER]!();

    expect(useMinesweeperStore.getState().pvpOpponentStatus).toBe('playing');
});
